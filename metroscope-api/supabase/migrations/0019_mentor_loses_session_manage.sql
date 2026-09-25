-- ═══════════════════════════════════════════════════════════════════════════
--  Revoke `session.manage` from MENTOR (doc 13 §8.3, doc 14 §3.1).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A security correction, found by the first test that exercised the grant.
--
-- The Phase 0 seed gave MENTOR `session.manage` with a comment explaining that
-- "RLS scopes it to rows they mentor, so the grant cannot reach another mentor's
-- calendar". That was written before any scheduling policy existed, and it is
-- not true of the one that does: `sessions_update` is `has_action('session.manage')`
-- with no ownership term, because a Secretary must be able to move ANY session, 
-- that is their job (doc 13 §8.3).
--
-- While no scheduling code existed the grant did nothing. Migration 0018 gave it
-- teeth: a Mentor holding it could book a session for any student with any
-- mentor, move or cancel any session in the business, and mark attendance on
-- lessons they were not in the room for.
--
-- doc 13 §8.3 lists the Mentor's actions as "mark attendance, update progress,
-- fill assessment, record competition result, assign material". Scheduling is
-- not among them, and §T.1 already deleted `/schedule/sessions/new` from the
-- mentor app on the same authority.
--
-- Marking attendance survives this: `session_attendance_write` authorises it by
-- having TAUGHT the session, not by a verb.
--
-- HEAD keeps the grant (it holds all 16 by design, so it can act for anyone).
-- SECRETARY keeps it because scheduling is their job.

DELETE FROM role_actions
WHERE action = 'session.manage'
  AND role_id IN (SELECT id FROM roles WHERE code = 'MENTOR');
