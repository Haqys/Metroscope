-- ═══════════════════════════════════════════════════════════════════════════
--  Assessments, coverage instead of ownership (doc 06 §2.5, doc 13 §12.9,
--  doc 03 FR-ASN-1..6 / FR-ASV-0..5, doc 14 §3.5).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §12.9 states the defect and the fix in one line: doc 12 §9.1 removed
-- mentor→student ownership, and with nobody assigned, **"no one is accountable
-- for a student being assessed."** The answer is not to put ownership back, the
-- client decided against it, but to make the gap visible: every ACTIVE student
-- × the current period, split into *Belum Dinilai* and *Selesai*.
--
-- "Nobody owns a student; everybody owns the number."
--
-- So the queue is a **period** question, not a "days since" question. That
-- distinction is load-bearing and it is the boundary with §3.6: assessment
-- coverage asks *"has this month been done"*; the progress board (FR-UPD-1)
-- asks *"how long since anybody touched this"*. Two different questions, two
-- different tasks, and collapsing them would make neither answerable.

/**
 * The four criteria of FR-ASN-3, closed.
 *
 * An enum rather than free text because the portal renders them as fixed rows
 * (FR-ASV-2) and the primary key below uses them to make "the same criterion
 * twice" unrepresentable. A fifth criterion is a migration, which is the right
 * amount of friction for changing what every mentor is asked to score.
 */
DO $$ BEGIN
  CREATE TYPE assessment_criterion AS ENUM ('UNDERSTANDING', 'PARTICIPATION', 'DISCIPLINE', 'READINESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/** The band shown beside the score. Derived, never client-supplied, see the trigger. */
DO $$ BEGIN
  CREATE TYPE assessment_category AS ENUM ('SANGAT_BAIK', 'BAIK', 'CUKUP', 'PERLU_PERHATIAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/** FR-ASV-4, the only feedback the family gives on an assessment. */
DO $$ BEGIN
  CREATE TYPE assessment_reaction_kind AS ENUM ('HELPFUL', 'MOTIVATING', 'THANKS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * The assessment period, in WITA.
 *
 * `YYYY-MM`, the same shape `billing_runs.period` already uses, so "which month
 * is this" has one answer across the product. WITA and not UTC: an assessment
 * written at 23:30 on the 31st in Denpasar belongs to that month, and UTC would
 * file it under the next one, which would show as an uncovered student on the
 * first of the month, to the Head, on the dashboard FR-ASN-6 describes.
 */
CREATE OR REPLACE FUNCTION app.assessment_period(at timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(at AT TIME ZONE 'Asia/Makassar', 'YYYY-MM')
$$;

COMMENT ON FUNCTION app.assessment_period(timestamptz) IS
  'Assessment period as YYYY-MM in WITA. One definition, so the queue and the write agree.';

-- ── the assessment ─────────────────────────────────────────────────────
/**
 * One mentor's structured monthly evaluation of one student (doc 06 §2.5).
 *
 * `UNIQUE (student_id, period)` is FR-ASN-1's whole model expressed as a
 * constraint: the coverage matrix is *student × period*, so a second assessment
 * for the same month is not a new record, it is the same record. It is also
 * what makes the claim lock below meaningful, two mentors racing produce one
 * winner and one 409 rather than two contradictory evaluations of a child.
 *
 * `avg_score` is `numeric(3,1)`, not an integer. doc 03 FR-ASV-0 exists
 * precisely because v1.0 said /10 while doc 05 rendered 81/100 in three places;
 * the resolution is "one scale, /10, one decimal, star rating, in the portal,
 * the mentor form, and the internal record". doc 06's `int avgScore` predates
 * that fix. Money is integer IDR because a rupiah has no fraction; a score out
 * of ten displayed as 8.1 does.
 *
 * Neither `avg_score` nor `category` is ever written by a caller. Both are
 * recomputed from `assessment_criteria` by a trigger, so the number a parent
 * reads cannot disagree with the four numbers it came from.
 */
CREATE TABLE IF NOT EXISTS assessments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  /** The author. Constrained to the caller by `assessments_insert`'s WITH CHECK. */
  mentor_id  uuid NOT NULL REFERENCES users(id),

  period     text NOT NULL,
  avg_score  numeric(3, 1) NOT NULL DEFAULT 0,
  category   assessment_category NOT NULL DEFAULT 'PERLU_PERHATIAN',
  /** FR-ASN-4, strengths and areas to improve, shown to student and parent. */
  note       text,
  /**
   * FR-ASV-5, what this assessment contributed to gamification.
   *
   * Stored here rather than derived from a ledger because `point_ledger` does
   * not exist: gamification is its own module and is not in Phase 3's list.
   * `students.points` is deliberately NOT incremented, its own comment defines
   * it as `sum(point_ledger.delta)`, and hand-incrementing it would make it the
   * second, drifting source of a number that has a defined source. See doc 14.
   */
  points_awarded integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assessments_student_period_uq UNIQUE (student_id, period),
  CONSTRAINT assessments_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT assessments_avg_range CHECK (avg_score >= 0 AND avg_score <= 10),
  CONSTRAINT assessments_points_nonneg CHECK (points_awarded >= 0)
);

CREATE INDEX IF NOT EXISTS assessments_student_idx ON assessments (student_id, period DESC);
CREATE INDEX IF NOT EXISTS assessments_period_idx ON assessments (period, created_at DESC);
CREATE INDEX IF NOT EXISTS assessments_mentor_idx ON assessments (mentor_id, created_at DESC);

/**
 * Per-criterion scores (doc 06 AssessmentCriterion, FR-ASN-3).
 *
 * The composite primary key is the invariant: one score per criterion per
 * assessment. A separate `id` column with a unique index would say the same
 * thing more slowly, and nothing here is ever referenced by another table.
 */
CREATE TABLE IF NOT EXISTS assessment_criteria (
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  criterion     assessment_criterion NOT NULL,
  score         integer NOT NULL,

  PRIMARY KEY (assessment_id, criterion),
  CONSTRAINT assessment_criteria_range CHECK (score >= 0 AND score <= 10)
);

/**
 * The score and the band are DERIVED, in the database.
 *
 * FR-ASN-5 says "submit; average + category computed", and if the service
 * computed them, an assessment whose criteria were later corrected would keep
 * the old average, silently, on a page a parent reads. Recomputing on every
 * change to the criteria makes that state unreachable.
 *
 * The bands are the ones the internal form already used, rescaled from /100 to
 * /10 by FR-ASV-0's ruling: 90/75/60 → 9.0/7.5/6.0. Not a new product rule, 
 * the same rule, on the scale the PRD settled on.
 */
CREATE OR REPLACE FUNCTION app.recompute_assessment_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target uuid := COALESCE(NEW.assessment_id, OLD.assessment_id);
  mean numeric(4, 2);
BEGIN
  SELECT round(avg(score)::numeric, 1) INTO mean
  FROM assessment_criteria WHERE assessment_id = target;

  UPDATE assessments
  SET avg_score = COALESCE(mean, 0),
      category = CASE
        WHEN COALESCE(mean, 0) >= 9.0 THEN 'SANGAT_BAIK'
        WHEN COALESCE(mean, 0) >= 7.5 THEN 'BAIK'
        WHEN COALESCE(mean, 0) >= 6.0 THEN 'CUKUP'
        ELSE 'PERLU_PERHATIAN'
      END::assessment_category,
      updated_at = now()
  WHERE id = target;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS assessment_criteria_recompute ON assessment_criteria;
CREATE TRIGGER assessment_criteria_recompute
AFTER INSERT OR UPDATE OR DELETE ON assessment_criteria
FOR EACH ROW EXECUTE FUNCTION app.recompute_assessment_score();

/**
 * The mentor's name, for a family that cannot read `users`.
 *
 * FR-ASV-1 requires the portal to show "category, period, and mentor", and a
 * guardian joining `users` gets NULL, because `users_select` closes that table
 * to customers. The same hole §3.1 found on the schedule and fixed the same
 * way: one column, behind owner rights, scoped by exactly the predicate that
 * already decides who may read the assessment. It cannot leak anything the
 * caller could not already see.
 */
CREATE OR REPLACE FUNCTION app.assessment_mentor_name(target uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.full_name
  FROM assessments a
  JOIN users u ON u.id = a.mentor_id
  WHERE a.id = target
    AND (app.owns_student(a.student_id) OR app.has_page('/assessments'))
$$;

COMMENT ON FUNCTION app.assessment_mentor_name(uuid) IS
  'Mentor display name for an assessment the caller may already read. Scoped by '
  'the same predicate as assessments_select, so it leaks nothing new.';

-- ── the soft lock ──────────────────────────────────────────────────────
/**
 * FR-ASN-2: "any mentor may **claim** an un-assessed student (soft lock, 24h)
 * to prevent two mentors writing the same assessment."
 *
 * The primary key is `(student_id, period)`, the same key the assessment
 * itself is unique on, because they are locks on the same slot in the coverage
 * matrix. Expiry is a column and not a partial index: "unexpired" is a fact
 * about now(), which no index can be built on, so takeover is an UPDATE guarded
 * by `expires_at < now()` and the constraint stops everything else.
 *
 * SOFT is the operative word. This table cannot prevent a write, a stale lock
 * must never be the reason a child goes unassessed, so the assessment INSERT
 * consults it and refuses only while somebody else's claim is live.
 */
CREATE TABLE IF NOT EXISTS assessment_claims (
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period     text NOT NULL,
  mentor_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  PRIMARY KEY (student_id, period),
  CONSTRAINT assessment_claims_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT assessment_claims_expiry_after_claim CHECK (expires_at > claimed_at)
);

CREATE INDEX IF NOT EXISTS assessment_claims_mentor_idx ON assessment_claims (mentor_id, expires_at);

-- ── the family's reply ─────────────────────────────────────────────────
/**
 * FR-ASV-4, "the only feedback the student gives here (assessments are
 * mentor-authored, not free testimonials)".
 *
 * `assessment_id` is the primary key, so one assessment carries one reaction:
 * a family can change their mind, not stack five reactions onto one report.
 */
CREATE TABLE IF NOT EXISTS assessment_reactions (
  assessment_id uuid PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,
  reaction      assessment_reaction_kind NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assessments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_criteria   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_claims     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_reactions  ENABLE ROW LEVEL SECURITY;

/**
 * INSERT and UPDATE only. An assessment is a child's school report: it is
 * corrected by its author, not deleted by anybody, and `points_awarded` on a
 * row that vanished would leave the portal's history with a hole. Withdrawing
 * one is not a use case any document describes, so no grant expresses it.
 *
 * The REVOKE is not redundant, and finding out why cost this task an assertion.
 * Migration 0024 took Supabase's blanket default ACL away from `anon` and
 * deliberately left `authenticated` alone, so every table still arrives with
 * `DELETE` and `TRUNCATE` already granted to it, and a `GRANT SELECT, INSERT,
 * UPDATE` line adds nothing it did not have. Only RLS stood behind
 * "nobody deletes an assessment", and RLS refuses a DELETE by matching zero
 * rows: silently, with a 200.
 *
 * Revoked here for the three tables this migration creates rather than
 * globally, which is still 0024's open item. `assessment_claims` keeps DELETE
 * because releasing a claim IS a delete.
 */
REVOKE DELETE, TRUNCATE ON assessments         FROM authenticated;
REVOKE DELETE, TRUNCATE ON assessment_criteria FROM authenticated;
REVOKE DELETE, TRUNCATE ON assessment_reactions FROM authenticated;
REVOKE TRUNCATE ON assessment_claims           FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON assessments          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON assessment_criteria  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON assessment_reactions TO authenticated;

/**
 * Nothing for `anon`, and migration 0024 is why that is now a real statement
 * rather than an omission: before it, Supabase's default ACL had already
 * granted every new table to `anon`. An assessment names a child, scores them
 * out of ten, and quotes a mentor about their weaknesses. It is the single
 * most private thing this product stores.
 */
