-- ═══════════════════════════════════════════════════════════════════════════
--  Learning materials (doc 13 §12.7, doc 14 §3.3).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This file decides whether a family can read teaching material they were never
-- given. Every customer-facing read narrows to app.student_entitled_to_material(),
-- which is defined once in migration 0022 precisely so that the portal list, the
-- detail page, the progress write and the mentor's roster all ask one question.
--
-- Writes are gated by `material.manage`, the seventeenth verb, added in this
-- task because doc 13 §8.3 names "assign material" as a Mentor action and none
-- of the sixteen covered it. The alternative was to let the `/materials` page
-- grant authorise writes, which would have been the first place in this codebase
-- where a page grant meant permission rather than navigation.

-- ── materials ──────────────────────────────────────────────────────────
/**
 * Two readers.
 *
 * Staff holding /materials see everything including drafts, because authoring
 * is the job. A guardian sees a module only if it is PUBLISHED *and* one of
 * their children is entitled to it, doc 13 §12.7's "publish state so
 * half-finished modules are not visible", enforced here rather than by a
 * `WHERE status = 'PUBLISHED'` somebody has to remember in five queries.
 *
 * The entitlement subquery is scoped by app.owns_student(), so a guardian
 * cannot probe entitlement for a child who is not theirs.
 */
DROP POLICY IF EXISTS materials_select ON materials;
CREATE POLICY materials_select ON materials
  FOR SELECT TO authenticated
  USING (
    app.has_page('/materials')
    OR (
      status = 'PUBLISHED'
      AND EXISTS (
        SELECT 1 FROM students s
        WHERE app.owns_student(s.id)
          AND app.student_entitled_to_material(s.id, materials.id)
      )
    )
  );

DROP POLICY IF EXISTS materials_write ON materials;
CREATE POLICY materials_write ON materials
  FOR ALL TO authenticated
  USING (app.has_action('material.manage'))
  WITH CHECK (app.has_action('material.manage'));

-- ── resources ──────────────────────────────────────────────────────────
/**
 * Visible with the module they belong to, expressed as an EXISTS over
 * `materials` rather than by restating the entitlement rule. The subquery runs
 * under RLS too, so it answers exactly what `materials_select` answers, and a
 * restated copy is the one that would eventually hand a PDF to a family that
 * could not see the module it belongs to.
 */
DROP POLICY IF EXISTS material_resources_select ON material_resources;
CREATE POLICY material_resources_select ON material_resources
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id));

DROP POLICY IF EXISTS material_resources_write ON material_resources;
CREATE POLICY material_resources_write ON material_resources
  FOR ALL TO authenticated
  USING (app.has_action('material.manage'))
  WITH CHECK (app.has_action('material.manage'));

-- ── assignments ────────────────────────────────────────────────────────
/**
 * Who was given what is INTERNAL.
 *
 * A guardian never reads this table: an assignment row names a programme or a
 * whole school level, which tells a family what other families were given. They
 * see the RESULT, the module is in their list, and that is all they need.
 */
DROP POLICY IF EXISTS material_assignments_select ON material_assignments;
CREATE POLICY material_assignments_select ON material_assignments
  FOR SELECT TO authenticated
  USING (app.has_page('/materials'));

DROP POLICY IF EXISTS material_assignments_write ON material_assignments;
CREATE POLICY material_assignments_write ON material_assignments
  FOR ALL TO authenticated
  USING (app.has_action('material.manage'))
  WITH CHECK (app.has_action('material.manage'));

-- ── progress ───────────────────────────────────────────────────────────
/**
 * A family reads and writes their own child's study status; staff holding
 * /materials read everyone's, because "who opened it" is the engagement
 * question doc 13 §12.7 asks for.
 *
 * The write is authorised by OWNERSHIP, not by a verb, none of the seventeen
 * means "record that my child opened a module", and marking your own child's
 * progress is not an administrative act. Staff cannot write it at all: a
 * mentor recording that a student "finished" a module they did not open would
 * make the engagement number describe the staff rather than the students.
 */
DROP POLICY IF EXISTS material_progress_select ON material_progress;
CREATE POLICY material_progress_select ON material_progress
  FOR SELECT TO authenticated
  USING (app.owns_student(student_id) OR app.has_page('/materials'));

DROP POLICY IF EXISTS material_progress_write ON material_progress;
CREATE POLICY material_progress_write ON material_progress
  FOR ALL TO authenticated
  USING (
    app.owns_student(student_id)
    AND app.student_entitled_to_material(student_id, material_id)
  )
  WITH CHECK (
    app.owns_student(student_id)
    AND app.student_entitled_to_material(student_id, material_id)
  );
