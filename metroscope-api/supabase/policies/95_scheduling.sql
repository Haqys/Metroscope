-- ═══════════════════════════════════════════════════════════════════════════
--  Scheduling, sessions, series, attendance, availability (doc 14 §3.1).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This is the file that decides whether one family can see where another
-- family's child will be on Wednesday afternoon. Every customer-facing read
-- narrows to app.owns_student(), the same way 50_students.sql does.
--
-- Staff reads are gated by the /schedule page grant (HEAD, MENTOR, SECRETARY)
-- rather than by a verb: there is no `session.read` among the 16 actions and
-- there should not be, page grants gate reads, verbs gate writes. A staff
-- member without /schedule gets an empty list, not a 403 that would confirm
-- somebody else's lesson exists.

-- ── sessions ───────────────────────────────────────────────────────────
/**
 * Three readers, and the middle one is the point.
 *
 * A parent sees their own children's lessons. Staff holding /schedule see
 * everything, because scheduling is coordination and a calendar with holes is
 * worse than no calendar. And a MENTOR sees their own sessions even without
 * /schedule, the mentor app's `/me` is their working day, and a mentor whose
 * page grants were narrowed should still know when to turn up.
 */
DROP POLICY IF EXISTS sessions_select ON sessions;
CREATE POLICY sessions_select ON sessions
  FOR SELECT TO authenticated
  USING (
    app.owns_student(student_id)
    OR mentor_id = app.current_user_id()
    OR app.has_page('/schedule')
  );

/**
 * `session.manage`. One of the 16 verbs, seeded to HEAD and SECRETARY.
 *
 * Deliberately NOT held by MENTOR. doc 13 §8.3 makes scheduling Secretary work,
 * and §T.1 deleted `/schedule/sessions/new` from the mentor app for the same
 * reason. A mentor marks attendance (below); they do not move the calendar.
 */
DROP POLICY IF EXISTS sessions_insert ON sessions;
CREATE POLICY sessions_insert ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('session.manage'));

DROP POLICY IF EXISTS sessions_update ON sessions;
CREATE POLICY sessions_update ON sessions
  FOR UPDATE TO authenticated
  USING (app.has_action('session.manage'))
  WITH CHECK (app.has_action('session.manage'));

/**
 * No DELETE policy, on purpose. A session that happened is a fact about a
 * child's month and a mentor's fee; a session that was called off is a
 * different fact. `status = 'CANCELLED'` with a reason says both. Deleting the
 * row says neither, and doc 06 §5 makes soft-delete-by-status the rule.
 */

-- ── series ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS session_series_select ON session_series;
CREATE POLICY session_series_select ON session_series
  FOR SELECT TO authenticated
  USING (
    app.owns_student(student_id)
    OR mentor_id = app.current_user_id()
    OR app.has_page('/schedule')
  );

DROP POLICY IF EXISTS session_series_write ON session_series;
CREATE POLICY session_series_write ON session_series
  FOR ALL TO authenticated
  USING (app.has_action('session.manage'))
  WITH CHECK (app.has_action('session.manage'));

-- ── attendance ─────────────────────────────────────────────────────────
/**
 * Readable by whoever can read the session it belongs to.
 *
 * Expressed as an EXISTS over `sessions` rather than by repeating the three
 * predicates above: repeating them means two copies of "can this parent see
 * this child", and the copy that drifts is the one that leaks. The subquery is
 * evaluated under RLS too, so it answers exactly the question the session
 * policy already answers.
 */
DROP POLICY IF EXISTS session_attendance_select ON session_attendance;
CREATE POLICY session_attendance_select ON session_attendance
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id));

/**
 * Marked by the mentor who taught it, or by anyone holding `session.manage`.
 *
 * This is the one write in the module a MENTOR can perform, and it is scoped to
 * their own sessions: attendance is a first-hand observation, and a mentor
 * recording who turned up to somebody else's lesson is a mistake at best.
 */
DROP POLICY IF EXISTS session_attendance_write ON session_attendance;
CREATE POLICY session_attendance_write ON session_attendance
  FOR ALL TO authenticated
  USING (
    app.has_action('session.manage')
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND s.mentor_id = app.current_user_id()
    )
  )
  WITH CHECK (
    app.has_action('session.manage')
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND s.mentor_id = app.current_user_id()
    )
  );

-- ── availability ───────────────────────────────────────────────────────
/**
 * Readable by staff who schedule, and by the mentor it describes.
 *
 * Not by parents: when a mentor is free is internal capacity information, and a
 * parent knowing the gaps in a mentor's week is an invitation to negotiate
 * around the Secretary rather than through them.
 */
DROP POLICY IF EXISTS mentor_availability_select ON mentor_availability;
CREATE POLICY mentor_availability_select ON mentor_availability
  FOR SELECT TO authenticated
  USING (mentor_id = app.current_user_id() OR app.has_page('/schedule'));

/**
 * A mentor maintains their own template; `session.manage` may edit anyone's.
 * Both are true statements about who knows the answer, the mentor knows when
 * they are free, and the Secretary is the one who has to work around it.
 */
DROP POLICY IF EXISTS mentor_availability_write ON mentor_availability;
CREATE POLICY mentor_availability_write ON mentor_availability
  FOR ALL TO authenticated
  USING (mentor_id = app.current_user_id() OR app.has_action('session.manage'))
  WITH CHECK (mentor_id = app.current_user_id() OR app.has_action('session.manage'));

-- ── reschedule requests (doc 14 §3.2) ──────────────────────────────────
/**
 * Three readers again, and the same three as `sessions`.
 *
 * A guardian sees requests about their own children, including ones staff
 * raised after a phone call, which they should: it is their child's lesson
 * being moved. The mentor teaching it sees them, because a request is the first
 * warning that their Wednesday may change. Staff holding /schedule see all,
 * because deciding is their job.
 *
 * Expressed through the session rather than by re-deriving ownership: the
 * subquery runs under RLS too, so it answers exactly the question
 * `sessions_select` already answers, and there is no second copy of
 * `app.owns_student()` to drift.
 */
DROP POLICY IF EXISTS reschedule_requests_select ON reschedule_requests;
CREATE POLICY reschedule_requests_select ON reschedule_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id));

/**
 * A guardian may ASK. That is the one write on this table they get, and it is
 * authorised by ownership rather than by a verb, none of the 16 means "ask to
 * move my own child's lesson", and inventing one would put customer
 * self-service into the same vocabulary as `payment.verify`.
 *
 * `WITH CHECK` also pins `requested_by_id` to the caller, so a request cannot
 * be filed in somebody else's name.
 */
DROP POLICY IF EXISTS reschedule_requests_insert ON reschedule_requests;
CREATE POLICY reschedule_requests_insert ON reschedule_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by_id = app.current_user_id()
    AND EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
        AND (app.owns_student(s.student_id) OR app.has_action('session.manage'))
    )
  );

/**
 * Deciding needs `session.manage`, the same grant that moves the calendar,
 * because that is what approving one does.
 *
 * The exception is a guardian withdrawing their own request, which is not a
 * decision about the schedule at all: it is taking back a question. Scoped to
 * the row they filed, and the service refuses any status change other than
 * WITHDRAWN on that path.
 */
DROP POLICY IF EXISTS reschedule_requests_update ON reschedule_requests;
CREATE POLICY reschedule_requests_update ON reschedule_requests
  FOR ALL TO authenticated
  USING (
    app.has_action('session.manage')
    OR requested_by_id = app.current_user_id()
  )
  WITH CHECK (
    app.has_action('session.manage')
    OR requested_by_id = app.current_user_id()
  );
