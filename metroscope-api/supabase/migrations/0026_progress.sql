-- ═══════════════════════════════════════════════════════════════════════════
--  Progress, the staleness board (doc 06 §2.4, doc 13 §7.2 / §12, doc 03
--  FR-UPD-1/2, doc 14 §3.6).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13's page audit: "**`/progress`** 🆕. Only `/progress/update` exists,
-- same problem. → Board of students by staleness (*"belum diupdate 14 hari"*),
-- with inline slider editing." FR-UPD-1 says the same in one line: "`/progress`
-- is a **staleness board**: students sorted by days since last progress
-- update, so the work surfaces itself."
--
-- **This is not the assessment question.** §3.5 asks "has this month been
-- done", per PERIOD, binary. This asks "how long since anybody touched this",
-- in DAYS, continuous. Two different worries about two different tables, and
-- §3.5 deliberately invented no day threshold because the only one any document
-- gives, fourteen, belongs here.

/**
 * Student ↔ topic percent (doc 06 §2.4).
 *
 * doc 06 is explicit that this is **current state, not history**: "Progress, 
 * student ↔ topic percent. Unique `(studentId, topicId)`. `updatedById` =
 * mentor." So the row is upserted, and `updated_at` is the fact the whole board
 * is built on. An append-only log would answer a question nobody asked and make
 * "where is this student now" a window function over it.
 *
 * There is no `note` column, and that absence is deliberate. The mentor's
 * qualitative note already has an authoritative home, `assessments.note`,
 * FR-ASN-4, written monthly and shown to the family, and a second note here
 * would be the same fact in two places with two different edit paths. The
 * portal's "Catatan dari Mentor" reads the assessment.
 */
CREATE TABLE IF NOT EXISTS progress (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  percent    integer NOT NULL DEFAULT 0,

  /** Who last moved the slider. Pinned to the caller by `progress_write`. */
  updated_by_id uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT progress_student_topic_uq UNIQUE (student_id, topic_id),
  CONSTRAINT progress_percent_range CHECK (percent >= 0 AND percent <= 100)
);

CREATE INDEX IF NOT EXISTS progress_student_idx ON progress (student_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS progress_topic_idx ON progress (topic_id);
CREATE INDEX IF NOT EXISTS progress_updated_idx ON progress (updated_at DESC);

-- ── the staleness rule, in ONE place ───────────────────────────────────
/**
 * Fourteen days. doc 13 §7.2: *"belum diupdate 14 hari"*.
 *
 * A function rather than a literal so the board, the detail page, the portal
 * and the tests cannot drift apart, and so changing the rule is one migration
 * rather than a search across four TypeScript files. §3.5's queue took the same
 * position for the opposite reason: it invented no number because it had none.
 */
CREATE OR REPLACE FUNCTION app.progress_stale_days()
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 14 $$;

COMMENT ON FUNCTION app.progress_stale_days() IS
  'The FR-UPD-1 staleness threshold, in calendar days. doc 13 §7.2: "belum diupdate 14 hari".';

/**
 * Calendar days since a timestamp, in WITA.
 *
 * **Calendar days, not 14 × 86400 seconds.** "Belum diupdate 14 hari" is a
 * sentence about dates on a wall calendar, and a mentor who updated a student
 * at 23:00 and looks again at 08:00 fourteen mornings later has let fourteen
 * days pass, whatever the elapsed milliseconds say. Doing this subtraction in
 * the browser would also make the answer depend on the reader's clock and
 * timezone, two people looking at the same board would see different numbers.
 */
CREATE OR REPLACE FUNCTION app.days_since_wita(at timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT ((now() AT TIME ZONE 'Asia/Makassar')::date - (at AT TIME ZONE 'Asia/Makassar')::date)
$$;

/**
 * NEVER / STALE / CURRENT, the three states FR-UPD-1 distinguishes.
 *
 * NEVER is not "very stale". A student nobody has ever recorded progress for
 * has no baseline at all, which is a different piece of work from one whose
 * numbers have gone quiet, and sorting them together would bury the ones with
 * nothing behind them under the ones that are merely late.
 *
 * The boundary is `>=`: on the fourteenth day the student is stale. Fourteen
 * days without an update is what the sentence says, so the fourteenth day is
 * when it becomes true.
 */
CREATE OR REPLACE FUNCTION app.progress_status(last_updated timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN last_updated IS NULL THEN 'NEVER'
    WHEN app.days_since_wita(last_updated) >= app.progress_stale_days() THEN 'STALE'
    ELSE 'CURRENT'
  END
$$;

COMMENT ON FUNCTION app.progress_status(timestamptz) IS
  'FR-UPD-1 state for a student. One definition, so no two surfaces can disagree.';

/**
 * The mentor's name, for a family that cannot read `users`.
 *
 * Third time this shape has been needed, §3.1 for sessions, §3.5 for
 * assessments, now progress, and for the same reason each time:
 * `users_select` closes that table to customers, so a guardian joining it gets
 * NULL. Owner rights, one column, scoped by exactly the predicate that already
 * decides who may read the progress row.
 */
CREATE OR REPLACE FUNCTION app.progress_updater_name(target_student uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.full_name
  FROM progress p
  JOIN users u ON u.id = p.updated_by_id
  WHERE p.student_id = target_student
    AND (app.owns_student(target_student) OR app.has_page('/progress'))
  ORDER BY p.updated_at DESC
  LIMIT 1
$$;

COMMENT ON FUNCTION app.progress_updater_name(uuid) IS
  'Who last updated this student''s progress. Scoped like progress_select, so it leaks nothing new.';

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

/**
 * INSERT and UPDATE only, and the REVOKE is the load-bearing half.
 *
 * §3.5 found this the hard way: migration 0024 revoked Supabase's blanket
 * default ACL from `anon` and deliberately left `authenticated` alone, so every
 * new table still arrives with `DELETE` and `TRUNCATE` already granted and a
 * `GRANT SELECT, INSERT, UPDATE` line adds nothing. RLS alone would refuse a
 * DELETE the way it refuses a SELECT, by matching zero rows, silently, with a
 * 200, which is indistinguishable from succeeding.
 *
 * DELETE is revoked rather than policied because removing a progress row is not
 * an operation the product has: a topic that stops being taught is a topic that
 * stops being offered, and the percent a student reached in it is still true.
 * Setting it back to 0 is an UPDATE and says something different.
 */
REVOKE DELETE, TRUNCATE ON progress FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON progress TO authenticated;

/**
 * Topics get their write grant here too.
 *
 * `topics` has existed since Phase 0 with a read policy and no way to create a
 * row, §3.3 recorded that and deferred the editor. FR-UPD-2 asks for "inline
 * per-topic slider editing", and per-topic anything is unreachable while the
 * table is empty, so this is the migration where progress stops being a screen
 * with nothing to render. Writes are gated by `material.manage` in
 * `30_master_data.sql`, which is where doc 13 puts topic CRUD (on `/materials`,
 * not on a new settings page invented for four fields).
 */
REVOKE TRUNCATE ON topics FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON topics TO authenticated;

/** Nothing for `anon`. A child's percentage per topic is not marketing copy. */
