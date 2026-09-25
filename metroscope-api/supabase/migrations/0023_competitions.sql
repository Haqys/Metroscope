-- ═══════════════════════════════════════════════════════════════════════════
--  Competitions. One source (doc 06 §7.3, doc 13 §12.8, doc 14 §3.4).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §P7 names the defect and its cost: "Internal CRUD writes to one place;
-- the portal reads a hardcoded catalog of 3 lomba. Adding a lomba in the admin
-- changes nothing for students." §12.8 states the fix in one word, **one**
-- source feeding portal Info Lomba and the public marketing calendar.
--
-- So there is exactly one `competitions` table, and it carries the marketing
-- copy as well as the operational fields. doc 13 §9.4 describes /site/competitions
-- as a collection that "mirrors /competitions, adds marketing copy"; a mirror is
-- two sources, which is the thing §12.8 exists to remove. Putting the copy on
-- the same row means there is nothing to mirror.
--
-- That row is registered in the CMS pipeline (content.registry.ts). It earns
-- that, unlike a material, a competition HAS a public URL, needs a 301 when its
-- slug changes, needs SEO meta and ISR invalidation, and is published rather
-- than merely switched on. Materials were deliberately kept out of the pipeline
-- in 0022 for the opposite reasons; the two decisions are consistent.

/** doc 06 §7.3 / the portal filter. Ordered least → most selective. */
DO $$ BEGIN
  CREATE TYPE competition_level AS ENUM ('SCHOOL', 'REGIONAL', 'PROVINCIAL', 'NATIONAL', 'INTERNATIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/** The fixture's `individualOrTeam`. BOTH exists because IID runs both tracks. */
DO $$ BEGIN
  CREATE TYPE competition_format AS ENUM ('INDIVIDUAL', 'TEAM', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE competition_mode AS ENUM ('ONLINE', 'OFFLINE', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * The outcome of one student in one competition (doc 06 COMPETITION_TARGET).
 *
 * PENDING is the default and means "entered, not yet decided", NOT "no result",
 * which is what an untyped NULL would have meant and would have made "how many
 * are still waiting" indistinguishable from "how many did we forget to record".
 * WINNER is the state doc 13 §10.5 auto-drafts an achievement article from.
 */
DO $$ BEGIN
  CREATE TYPE competition_result AS ENUM ('PENDING', 'WINNER', 'FINALIST', 'PARTICIPANT', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/** doc 06 TeamMember.role, "ketua" / "anggota", stored in English per convention. */
DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('LEADER', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── the catalogue ──────────────────────────────────────────────────────
/**
 * A competition.
 *
 * Everything the deleted `competition-data.ts` held is a column here, because
 * the portal's Info Lomba renders every one of them and doc 13 §H14 lists them
 * as the missing fields. What is NOT a column is the fixture's `status`
 * ('Ongoing' | 'Coming Soon' | 'Closed'): that is a function of today and two
 * dates, and storing it means a lomba stays "Ongoing" for a year after it shut.
 * It is derived on read, see `app.competition_phase()`.
 *
 * `registration_fee` is integer IDR per the money convention. `fee_note` exists
 * beside it because real fees are tiered ("Rp1.150.000/Tim online &
 * Rp3.150.000/Tim offline") and squeezing that into one integer would be a lie
 * with a decimal point. The integer is what sorting and filtering read; the note
 * is what a parent reads.
 */
CREATE TABLE IF NOT EXISTS competitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,

  -- marketing copy (doc 13 §9.4, same row, not a mirror)
  summary     text,
  description text,
  cover_id    uuid REFERENCES media_assets(id) ON DELETE SET NULL,

  organizer   text,
  venue       text,
  level       competition_level NOT NULL DEFAULT 'NATIONAL',
  format      competition_format NOT NULL DEFAULT 'INDIVIDUAL',
  mode        competition_mode NOT NULL DEFAULT 'OFFLINE',
  /** Free-form subject tags, "Science Project", "Invention". Not an enum: this
   *  is the organiser's vocabulary and it changes every season. */
  categories  text[] NOT NULL DEFAULT '{}',
  /**
   * Which school levels may enter. Replaces the fixture's junior/senior/both.
   *
   * `text[]` rather than `school_level[]`, matching `programs.levels`, because
   * the CMS pipeline's generic patch binds every array through `textArray()`
   * and an enum array would need a per-type cast the pipeline does not have.
   * The CHECK below recovers what the enum would have given, the difference is
   * that it is a constraint on this table rather than a type the pipeline has
   * to know about.
   */
  levels      text[] NOT NULL DEFAULT '{}',

  registration_fee  integer,
  fee_note          text,
  registration_url  text,
  guidebook_url     text,

  registration_opens_at timestamptz,
  /** The date the portal calendar places the chip on. UTC; rendered WITA. */
  registration_deadline timestamptz NOT NULL,
  event_start date,
  event_end   date,

  -- ── CMS pipeline contract (doc 14 Phase 2) ──
  status         content_status NOT NULL DEFAULT 'DRAFT',
  publish_at     timestamptz,
  published_at   timestamptz,
  review_note    text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  version        integer NOT NULL DEFAULT 0,
  locale         text NOT NULL DEFAULT 'id',

  created_by_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT competitions_event_order CHECK (event_end IS NULL OR event_start IS NULL OR event_end >= event_start),
  CONSTRAINT competitions_fee_nonneg CHECK (registration_fee IS NULL OR registration_fee >= 0),
  CONSTRAINT competitions_levels_valid CHECK (levels <@ ARRAY['SD', 'SMP', 'SMA'])
);

CREATE INDEX IF NOT EXISTS competitions_deadline_idx ON competitions (registration_deadline);
CREATE INDEX IF NOT EXISTS competitions_status_idx ON competitions (status, registration_deadline);
CREATE INDEX IF NOT EXISTS competitions_levels_idx ON competitions USING gin (levels);

/**
 * Ongoing / Coming Soon / Closed, computed rather than stored.
 *
 * IMMUTABLE would be wrong. It reads now(). STABLE is correct and lets it be
 * used in a SELECT list without re-evaluating per row against a moving clock.
 */
CREATE OR REPLACE FUNCTION app.competition_phase(opens_at timestamptz, deadline timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN deadline < now() THEN 'CLOSED'
    WHEN opens_at IS NOT NULL AND opens_at > now() THEN 'UPCOMING'
    ELSE 'OPEN'
  END
$$;

COMMENT ON FUNCTION app.competition_phase(timestamptz, timestamptz) IS
  'Registration phase derived from the clock. Stored phases go stale silently.';

-- ── participants ───────────────────────────────────────────────────────
/**
 * One student entered in one competition (doc 06 COMPETITION_TARGET).
 *
 * `readiness_pct` is the number `/schedule`'s sidebar has been printing since
 * the beginning with nothing behind it, schedule-data.ts said so in its own
 * comment. It is a mentor's judgement, 0–100, and the CHECK is here because a
 * percentage outside its range is not a value that means anything.
 *
 * UNIQUE (student_id, competition_id) is doc 06's constraint, and it is also
 * what makes the team tables below able to reference a participant by natural
 * key instead of trusting the caller to keep two ids consistent.
 */
CREATE TABLE IF NOT EXISTS competition_targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,

  readiness_pct  integer NOT NULL DEFAULT 0,
  result         competition_result NOT NULL DEFAULT 'PENDING',
  /** "Juara 2", "Medali Perunggu", the organiser's words, not ours. */
  award          text,
  score          integer,
  certificate_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  note           text,

  added_by_id    uuid REFERENCES users(id),
  /** Who recorded the RESULT, and when. Distinct from who entered the student. */
  recorded_by_id uuid REFERENCES users(id),
  recorded_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT competition_targets_student_uq UNIQUE (student_id, competition_id),
  CONSTRAINT competition_targets_readiness_range CHECK (readiness_pct BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS competition_targets_competition_idx
  ON competition_targets (competition_id, result);
CREATE INDEX IF NOT EXISTS competition_targets_student_idx ON competition_targets (student_id);

-- ── teams ──────────────────────────────────────────────────────────────
/**
 * doc 13 §12.8: "no team UI despite Team/TeamMember existing". They existed in
 * doc 06 only; no table was ever created.
 *
 * The redundant UNIQUE (id, competition_id) is not redundant: it is the target
 * of the composite foreign key in `team_members`, which is what makes "a team's
 * members are entered in that team's competition" a structural fact rather than
 * something three call sites check.
 */
CREATE TABLE IF NOT EXISTS teams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name           text NOT NULL,
  /** The mentor coaching this team. Optional, teams form before coaching does. */
  mentor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teams_competition_name_uq UNIQUE (competition_id, name),
  CONSTRAINT teams_id_competition_uq UNIQUE (id, competition_id)
);

CREATE INDEX IF NOT EXISTS teams_competition_idx ON teams (competition_id);
CREATE INDEX IF NOT EXISTS teams_mentor_idx ON teams (mentor_id);

/**
 * Membership, with three invariants the database owns.
 *
 * `competition_id` is carried here purely so the two composite FKs below can
 * exist. Denormalisation usually invites drift; here it does the opposite, 
 * both FKs pin it, so the column cannot disagree with either parent.
 *
 *   1. a member belongs to the team's competition   → FK to teams(id, competition_id)
 *   2. a member is entered in that competition      → FK to competition_targets(student_id, competition_id)
 *   3. one team per student per competition         → unique index below
 *   4. one leader per team                          → partial unique index below
 *
 * (2) is the one worth having: without it a child can be listed in a lomba team
 * while having no target row, which means no readiness, no result, and an
 * invisible participant on the day the certificates are written.
 */
CREATE TABLE IF NOT EXISTS team_members (
  team_id        uuid NOT NULL,
  competition_id uuid NOT NULL,
  student_id     uuid NOT NULL,
  role           team_role NOT NULL DEFAULT 'MEMBER',
  created_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (team_id, student_id),

  CONSTRAINT team_members_team_fk
    FOREIGN KEY (team_id, competition_id) REFERENCES teams(id, competition_id) ON DELETE CASCADE,
  CONSTRAINT team_members_target_fk
    FOREIGN KEY (student_id, competition_id)
    REFERENCES competition_targets(student_id, competition_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_team_per_competition
  ON team_members (competition_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_leader
  ON team_members (team_id) WHERE role = 'LEADER';
CREATE INDEX IF NOT EXISTS team_members_student_idx ON team_members (student_id);

/**
 * A student's readiness, and whether a family may see the competition at all.
 *
 * A guardian reads the public catalogue like anyone else, but `competition_targets`
 * is theirs only for their own children. This is the one place that says so, and
 * `97_competitions.sql` is its only caller, the function exists so the portal's
 * "Lomba Saya" and the target write agree by construction.
 */
CREATE OR REPLACE FUNCTION app.owns_competition_target(target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM competition_targets t
    WHERE t.id = target_id AND app.owns_student(t.student_id)
  )
$$;

-- ── the Mentor's read grant (doc 13 §8.3) ──────────────────────────────
/**
 * doc 13 §8.3's page matrix gives Mentor `/competitions` as READ, and §8.3's
 * action list names "record competition result" among their five key actions.
 * The seed never granted the page, so a mentor could not reach the record they
 * are expected to write. Granting the page opens the read; the write stays
 * behind `progress.edit`, which is a verb they already hold.
 */
INSERT INTO role_pages (role_id, href)
SELECT r.id, '/competitions'
FROM roles r
WHERE r.code = 'MENTOR'
ON CONFLICT DO NOTHING;

ALTER TABLE competitions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON competitions        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON competition_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON teams               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_members        TO authenticated;

/**
 * `anon` reads the catalogue and NOTHING else. doc 13 §5.1 calls the public
 * competition calendar "the single best organic lead magnet Metroscope owns",
 * so it has to be readable without an account, but participants, teams and
 * results name children, and none of those tables is granted here.
 *
 * Not granting a table is not the same as it being ungranted: Supabase's
 * default ACL had already given `anon` full DML on every table in `public`,
 * including these four. Migration 0024 takes that back. This line is what
 * survives it.
 */
GRANT SELECT ON competitions TO anon;
