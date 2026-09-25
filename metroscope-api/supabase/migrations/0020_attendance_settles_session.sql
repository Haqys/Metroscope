-- ═══════════════════════════════════════════════════════════════════════════
--  Marking attendance closes the session (doc 14 §3.1).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Hadir" and "masih terjadwal" cannot both be true, so recording attendance
-- has to settle `sessions.status`. Migration 0018 left that to the service,
-- which issued an UPDATE after the INSERT, and it worked only for callers
-- holding `session.manage`.
--
-- Migration 0019 took that grant off MENTOR, which is correct (doc 13 §8.3) and
-- which broke the arrangement immediately: the one person who actually knows
-- who turned up became the one person whose mark left the calendar saying
-- SCHEDULED forever. Nothing errored. The attendance row was written, the API
-- returned 200, and the session quietly stayed open.
--
-- A trigger fixes the ownership question rather than working around it. It runs
-- as the function owner, so `sessions_update` does not gate it; the rule lives
-- in one place; and every path that ever writes attendance. This API, a
-- Secretary correcting a record, a future import, settles the status the same
-- way. The service no longer touches `sessions` at all when marking.
--
-- SECURITY DEFINER with a pinned search_path, per the convention in
-- `00_helpers.sql`: it must outrank RLS, so it must not be able to be tricked
-- into resolving `sessions` to something else.

CREATE OR REPLACE FUNCTION app.settle_session_on_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  /**
   * Only a SCHEDULED session is settled. A session already CANCELLED must not
   * be resurrected by a late attendance mark, and one already DONE is being
   * corrected rather than closed, the attendance row changes, the status is
   * already right.
   *
   * ABSENT is NO_SHOW rather than DONE: doc 06 keeps them distinct precisely so
   * a mentor-fee report can decide which of the two it pays for.
   */
  UPDATE sessions
  SET status = CASE WHEN NEW.status = 'ABSENT' THEN 'NO_SHOW'::session_status
                    ELSE 'DONE'::session_status END,
      updated_at = now()
  WHERE id = NEW.session_id
    AND status = 'SCHEDULED';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_attendance_settles ON session_attendance;
CREATE TRIGGER session_attendance_settles
  AFTER INSERT OR UPDATE ON session_attendance
  FOR EACH ROW EXECUTE FUNCTION app.settle_session_on_attendance();
