-- ═══════════════════════════════════════════════════════════════════════════
--  Sessions, series and attendance (doc 06 §2.3, doc 13 §12.6, doc 14 §3.1).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The first academic table in the schema. Everything before this migration is
-- identity, authorisation, the funnel, money and the CMS, 38 tables, none of
-- which knows that anybody is taught anything. `/schedule`, `/portal/schedule`
-- and the mentor's own calendar have all been rendering a fixture.
--
-- doc 13 §12.6 lists what is missing and it is not a UI gap: "create-only form;
-- no index, no edit, no conflict detection, no series", with the risk stated as
-- "double-booked mentors". This migration is the half of that which belongs in
-- the database, including the double-booking, which is enforced here rather
-- than in a service, for reasons under `sessions_mentor_no_overlap` below.

/**
 * Overlap exclusion needs GiST indexes over a scalar (`mentor_id`) alongside a
 * range. `btree_gist` is what makes `WITH =` legal in an EXCLUDE constraint.
 */
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE session_type AS ENUM ('CONSULTATION', 'LESSON', 'ASSESSMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * doc 06 §2.3 also lists RESCHEDULED. It is deliberately absent until §3.2
 * builds `reschedule_requests`: a status nothing can set and nothing can read
 * is a promise the schema makes and the product does not keep, and adding an
 * enum value later is one `ALTER TYPE`.
 */
DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('SCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('PRESENT', 'EXCUSED', 'ABSENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE series_status AS ENUM ('ACTIVE', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * A weekly teaching slot, "Rabu 16.00, 90 menit, Kak Dinda, sampai lulus".
 *
 * doc 06 §7.3 specifies `rrule`. This is a weekday plus a time instead, and the
 * difference is deliberate: the business cadence is "N kali seminggu at fixed
 * times" (doc 09. Rabu 16.00 dan Sabtu 10.00), which two rows express exactly.
 * An rrule string would need a parser, an expander and a timezone story that
 * `RRULE:FREQ=WEEKLY;BYDAY=WE` does not by itself provide, to represent a case
 * nobody has asked for. Two series is also what an editor actually manipulates:
 * moving Saturday's slot should not touch Wednesday's, and with one rrule it
 * would.
 *
 * The series is a RULE, not a schedule. Sessions are materialised rows (below),
 * so a session that has happened keeps its own time even if the rule changes
 * afterwards, which is what "edit this one" versus "edit the series" means.
 */
CREATE TABLE IF NOT EXISTS session_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mentor_id   uuid NOT NULL REFERENCES users(id),
  program_id  uuid REFERENCES programs(id),

  /** 0 = Sunday, matching Postgres `EXTRACT(DOW)` and JS `getDay()`. */
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  /** Local wall-clock time in WITA. See the note on `sessions.starts_at`. */
  start_time   time NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 15 AND 480),

  starts_on   date NOT NULL,
  /** NULL = open-ended; the generator fills a rolling horizon. */
  ends_on     date,
  status      series_status NOT NULL DEFAULT 'ACTIVE',

  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT session_series_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS session_series_student_idx ON session_series (student_id, status);
CREATE INDEX IF NOT EXISTS session_series_mentor_idx ON session_series (mentor_id, status);

/**
 * One class instance, doc 06 §2.3.
 *
 * `starts_at` is `timestamptz`, so the instant is unambiguous and the WITA
 * rendering happens at the edges (CLAUDE.md: timestamps UTC, render WITA). The
 * series stores a wall-clock `time` because "Rabu 16.00" is a promise about the
 * clock on the wall, not about an instant; the generator converts one to the
 * other in `Asia/Makassar`, which is the only place the two meet.
 *
 * `student_id` and `program_id` are carried directly rather than through
 * `enrollments`, per doc 06: a session outlives the enrolment row it was
 * arranged under, and a consultation happens before any enrolment exists at all.
 */
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** NULL for a one-off. ON DELETE SET NULL: deleting a rule is not deleting history. */
  series_id   uuid REFERENCES session_series(id) ON DELETE SET NULL,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mentor_id   uuid NOT NULL REFERENCES users(id),
  program_id  uuid REFERENCES programs(id),

  type        session_type NOT NULL DEFAULT 'LESSON',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  status      session_status NOT NULL DEFAULT 'SCHEDULED',

  /** Google Calendar / Meet. Written by the calendar job; NULL until then. */
  gcal_event_id text,
  meet_url      text,

  note          text,
  /** Required by the API when cancelling, a cancellation without one is a mystery. */
  cancel_reason text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sessions_time_order CHECK (ends_at > starts_at)
);

-- doc 06 §5: the two indexes every calendar query uses.
CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions (student_id, starts_at);
CREATE INDEX IF NOT EXISTS sessions_mentor_idx ON sessions (mentor_id, starts_at);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status, starts_at);
CREATE INDEX IF NOT EXISTS sessions_series_idx ON sessions (series_id, starts_at);

/**
 * A mentor cannot be in two places at once, and the database is what says so.
 *
 * doc 13 §12.6 asks for a "conflict warning". A warning computed in a service
 * is a SELECT followed by an INSERT, and between those two statements another
 * request can insert the session that makes the answer wrong, which is exactly
 * how a double-booking survives a check that "works" in testing. Here the
 * overlap is impossible, and the API's pre-flight check becomes what it should
 * be: a courtesy that tells the user before they submit, not the thing standing
 * between two students and the same mentor.
 *
 * Scoped to SCHEDULED and DONE. A cancelled session must not block the slot it
 * vacated. That is the whole point of cancelling it.
 */
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_mentor_no_overlap;
ALTER TABLE sessions ADD CONSTRAINT sessions_mentor_no_overlap
  EXCLUDE USING gist (
    mentor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('SCHEDULED', 'DONE'));

/**
 * And neither can a student. Cheaper to state than to explain to a parent whose
 * child was booked into two lessons at once by two different staff members.
 */
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_student_no_overlap;
ALTER TABLE sessions ADD CONSTRAINT sessions_student_no_overlap
  EXCLUDE USING gist (
    student_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('SCHEDULED', 'DONE'));

/**
 * Attendance, doc 06: 1:1 with a session.
 *
 * Its own table rather than columns on `sessions`, because it is written by a
 * different person at a different time under a different permission: a
 * Secretary schedules, a Mentor marks. A separate table lets RLS say that
 * without `sessions_update` having to distinguish "moved the lesson" from
 * "recorded who turned up".
 *
 * The primary key IS the session id, so "marked twice" is not representable.
 */
CREATE TABLE IF NOT EXISTS session_attendance (
  session_id  uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  status      attendance_status NOT NULL,
  note        text,
  marked_by_id uuid REFERENCES users(id),
  marked_at   timestamptz NOT NULL DEFAULT now()
);

/**
 * When a mentor is willing to teach, doc 06 §2.3 "MentorAvailability".
 *
 * Used for a SOFT warning only, and that distinction is the design. Two
 * sessions overlapping is an error the database refuses; teaching outside a
 * declared window is a preference a Secretary may knowingly override, a mentor
 * who agreed to a one-off Sunday morning should not need their weekly template
 * edited before the session can be booked. Conflating the two would either let
 * double-bookings through or make the schedule unusable in the ordinary case
 * where somebody made an arrangement by phone.
 */
CREATE TABLE IF NOT EXISTS mentor_availability (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time   time NOT NULL,

  CONSTRAINT mentor_availability_order CHECK (end_time > start_time),
  CONSTRAINT mentor_availability_uq UNIQUE (mentor_id, weekday, start_time)
);

CREATE INDEX IF NOT EXISTS mentor_availability_idx ON mentor_availability (mentor_id, weekday);

ALTER TABLE session_series      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_availability ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON session_series      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON session_attendance  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mentor_availability TO authenticated;

/**
 * No grant to `anon`. A session row names a child, names the staff member
 * teaching them, and says exactly where they will be at 16.00 on Wednesday.
 * None of the four tables here has any business being publicly readable, and
 * the public site has no page that would want one.
 */
