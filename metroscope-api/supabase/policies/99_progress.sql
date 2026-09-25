-- ═══════════════════════════════════════════════════════════════════════════
--  Progress (doc 03 FR-UPD-1/2, doc 13 §7.2, doc 14 §3.6).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two readers, the same shape §3.5 used and for the same reason: staff running
-- the board, and the family whose child it is about.
--
--   staff holding `/progress`  → HEAD and MENTOR (doc 13 §8.3)
--   the family                 → their own children, via app.owns_student()
--
-- SECRETARY holds `/students` and `student.edit` and sees nothing here, exactly
-- as they see nothing on `/assessments`. A percentage per topic is a teaching
-- judgement, not roster administration.

DROP POLICY IF EXISTS progress_select ON progress;
CREATE POLICY progress_select ON progress
  FOR SELECT TO authenticated
  USING (app.has_page('/progress') OR app.owns_student(student_id));

/**
 * `progress.edit`, the verb the Phase 0 matrix already gives the Mentor.
 *
 * No new verb, for the second task running: §3.5 reused `assessment.submit`
 * and this reuses `progress.edit`. The vocabulary was written to cover exactly
 * these two operations and it does.
 *
 * `updated_by_id = app.current_user_id()` is the same pin `assessments_insert`
 * uses. It is what makes "who last touched this" answerable at all, without
 * it, any holder of the verb could attribute an update to a colleague, and the
 * board's "diperbarui oleh" column would be a field rather than a fact.
 *
 * **Deliberately NOT scoped to sessions the mentor taught.** doc 12 §9.1
 * removed mentor→student ownership and doc 06 §7.2 repeats it: "mentors relate
 * to students only per event". Any mentor may update any student's progress,
 * which is precisely why §3.6 exists, with nobody assigned, the board is what
 * makes the gap visible. Narrowing this policy to "students I taught" would
 * quietly reinstate the ownership model the client rejected.
 */
DROP POLICY IF EXISTS progress_insert ON progress;
CREATE POLICY progress_insert ON progress
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_action('progress.edit')
    AND updated_by_id = app.current_user_id()
  );

DROP POLICY IF EXISTS progress_update ON progress;
CREATE POLICY progress_update ON progress
  FOR UPDATE TO authenticated
  USING (app.has_action('progress.edit'))
  WITH CHECK (
    app.has_action('progress.edit')
    AND updated_by_id = app.current_user_id()
  );

/**
 * No DELETE policy, and no DELETE grant (migration 0026).
 *
 * Both, because either alone is not enough: RLS refuses a DELETE by matching
 * zero rows, silently, with a 200, and the grant layer still carries
 * Supabase's blanket default for `authenticated`. §3.5 found that the hard way
 * on `assessments`.
 */

-- ── topics ─────────────────────────────────────────────────────────────
/**
 * The write half `topics` never had.
 *
 * The table has existed since Phase 0 with a read policy and no way to create a
 * row; §3.3 recorded the gap and deferred the editor to "a `/settings/programs`
 * concern". FR-UPD-2's per-topic sliders make that deferral load-bearing, a
 * board of topic percentages over an empty topics table is a screen with
 * nothing to render, so the write lands here, gated by `material.manage`,
 * which is the verb doc 13 pairs with the page it puts topic CRUD on.
 *
 * Not a new verb: `material.manage` is the seventeenth from §3.3, and a topic
 * is the unit a material is filed under. Adding an eighteenth for four fields
 * on the same screen would be the thing the closed set exists to prevent.
 */
DROP POLICY IF EXISTS topics_write ON topics;
CREATE POLICY topics_write ON topics
  FOR ALL TO authenticated
  USING (app.has_action('material.manage'))
  WITH CHECK (app.has_action('material.manage'));
