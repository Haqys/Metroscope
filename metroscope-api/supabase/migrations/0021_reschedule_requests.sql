-- ═══════════════════════════════════════════════════════════════════════════
--  Reschedule requests (doc 06 §2.3, doc 13 §12.6, doc 14 §3.2).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §12.6 states the defect this closes in one line: "Reschedule requests
-- have **no internal queue**: the parent submits into a void", with the risk
-- as "silent SLA breach on a promise made in the portal UI". The wizard has
-- existed since the rebuild, four steps and a confirmation screen, and nothing
-- behind it. §3.1 gave it real sessions to choose from; it still had nowhere to
-- send the choice.
--
-- The queue it lands in already exists. `/inbox` is a UNION ALL of sources, each
-- gated by its own RLS, and `reschedule` has been a declared-but-unbuilt type
-- since §1.3 precisely so this would be a new source function rather than a new
-- API.

/**
 * The status §3.1 deliberately left out.
 *
 * Migration 0018 omitted RESCHEDULED from `session_status` because nothing
 * could set it and nothing could read it, "a promise the schema makes and the
 * product does not keep". This is the task that keeps it.
 *
 * Legal in a transaction on PG 12+ as long as the value is not USED in the same
 * transaction, which it is not: the first row to take it is written at runtime.
 */
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'RESCHEDULED';

DO $$ BEGIN
  CREATE TYPE reschedule_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * One family's request to move one lesson.
 *
 * doc 06 models the outcome as a LINK between two sessions, original plus
 * `newSessionId`, rather than as an edit to the original, and that shape is
 * kept: approving cancels the original as RESCHEDULED and creates a
 * replacement. An UPDATE would be simpler and would erase the fact that the
 * lesson moved, which is exactly what a parent asks about later ("kami sudah
 * minta pindah, kok tercatat bolos?") and what a mentor-fee report has to
 * distinguish.
 */
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  /** The account that asked, a guardian, or staff acting on a phone call. */
  requested_by_id uuid NOT NULL REFERENCES users(id),
  reason       text NOT NULL,
  note         text,
  /**
   * What the family would prefer. Optional, and never binding: staff decide the
   * final time, and approving at a different one is the normal case when the
   * requested slot is taken.
   */
  preferred_starts_at timestamptz,

  status       reschedule_status NOT NULL DEFAULT 'PENDING',

  decided_by_id uuid REFERENCES users(id),
  decided_at    timestamptz,
  /** Required by the API when rejecting. A refusal with no reason is a dead end. */
  decision_note text,
  /** The lesson that replaced it. Set only on approval. */
  new_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

/**
 * One OPEN request per session, not one request ever.
 *
 * doc 06 specifies `sessionId` as a plain unique key. Taken literally that
 * means a family whose request was rejected can never ask again about that
 * lesson, which is not a rule anybody intends; it is what a 1:1 model looks
 * like when it is written before the reject path exists. A partial index says
 * the thing that is actually true: two open requests for the same lesson would
 * be two people deciding the same question.
 */
CREATE UNIQUE INDEX IF NOT EXISTS reschedule_requests_open_uq
  ON reschedule_requests (session_id) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS reschedule_requests_queue_idx
  ON reschedule_requests (status, created_at);

ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON reschedule_requests TO authenticated;

/** No DELETE grant. A withdrawn request is a status, like every other outcome. */
