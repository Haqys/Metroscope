-- ═══════════════════════════════════════════════════════════════════════════
--  Students and enrolment.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This is the file that decides whether one family can see another's child.
-- Everything customer-facing narrows to app.owns_student().

DROP POLICY IF EXISTS students_select ON students;
CREATE POLICY students_select ON students
  FOR SELECT TO authenticated
  USING (
    user_id = app.current_user_id()   -- the family's own record
    OR app.has_page('/students')      -- staff with the students page
  );

DROP POLICY IF EXISTS students_update ON students;
CREATE POLICY students_update ON students
  FOR UPDATE TO authenticated
  USING (app.has_action('student.edit'))
  WITH CHECK (app.has_action('student.edit'));

/**
 * Students are created by the conversion transaction, which runs elevated
 * ('user.provision') because the parent's user account does not exist yet at
 * that moment. Staff can still create one directly with student.edit.
 */
DROP POLICY IF EXISTS students_insert ON students;
CREATE POLICY students_insert ON students
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('student.edit'));

-- ── leaderboard ────────────────────────────────────────────────────────
--
-- ⚠️ NOT IMPLEMENTED HERE. students.show_on_leaderboard defaults to false and
-- the leaderboard is Phase 3 (doc 14). When it lands it must NOT relax
-- students_select: a leaderboard needs display name and points for opted-in
-- students, not the row, which carries dob, school and the parent's phone
-- number. Give it a view with exactly those columns and its own policy.
-- Widening this policy instead would expose minors' contact details to every
-- other family, see doc 13 open item 4.

-- ── enrollments ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS enrollments_select ON enrollments;
CREATE POLICY enrollments_select ON enrollments
  FOR SELECT TO authenticated
  USING (
    app.owns_student(student_id)
    OR app.has_page('/students')
  );

DROP POLICY IF EXISTS enrollments_write ON enrollments;
CREATE POLICY enrollments_write ON enrollments
  FOR ALL TO authenticated
  USING (app.has_action('student.edit'))
  WITH CHECK (app.has_action('student.edit'));
