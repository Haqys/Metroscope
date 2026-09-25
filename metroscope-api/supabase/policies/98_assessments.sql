-- ═══════════════════════════════════════════════════════════════════════════
--  Assessments (doc 13 §12.9, doc 03 FR-ASN/FR-ASV, doc 14 §3.5).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This file decides whether one family can read another child's report card,
-- and whether anybody other than a mentor can write one.
--
-- Two readers, and the split is not the usual staff/customer one:
--
--   staff holding `/assessments`  → HEAD and MENTOR **only**
--   the family                    → their own children, via app.owns_student()
--
-- SECRETARY holds `/students` and `student.edit` and still sees nothing here.
-- That is deliberate and it is doc 13 §8.3's own matrix: `/assessments` is
-- ✅ for Head and Mentor and, for everyone else. An evaluation of a child is
-- not administrative data, and the role that manages the roster has no reason
-- to read it.

-- ── the assessment ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS assessments_select ON assessments;
CREATE POLICY assessments_select ON assessments
  FOR SELECT TO authenticated
  USING (app.has_page('/assessments') OR app.owns_student(student_id));

/**
 * The author is the caller. Always.
 *
 * `mentor_id = app.current_user_id()` is not a convenience. It is what makes
 * "who said this about my child" answerable. Without it, `assessment.submit`
 * would let any holder file an evaluation under a colleague's name, and the
 * portal would show that colleague's name to the parent.
 *
 * It also removes the need to check that the author is staff: only staff roles
 * hold `assessment.submit`, so a row that satisfies both conditions was written
 * by a member of the team, by construction rather than by a lookup.
 */
DROP POLICY IF EXISTS assessments_insert ON assessments;
CREATE POLICY assessments_insert ON assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_action('assessment.submit')
    AND mentor_id = app.current_user_id()
  );

/**
 * Corrections belong to whoever wrote it.
 *
 * doc 03 and doc 06 describe no correction workflow, and an assessment is not
 * a draft. FR-ASN-5 sends it straight to the portal. So the narrowest rule
 * that still lets a mentor fix a typo they made an hour ago: the author, and
 * nobody else. A Head who disagrees with an evaluation is having a conversation
 * with a mentor, not editing their words.
 *
 * The WITH CHECK repeats `mentor_id = app.current_user_id()` so an UPDATE
 * cannot re-attribute an assessment on its way out.
 */
DROP POLICY IF EXISTS assessments_update ON assessments;
CREATE POLICY assessments_update ON assessments
  FOR UPDATE TO authenticated
  USING (
    app.has_action('assessment.submit')
    AND mentor_id = app.current_user_id()
  )
  WITH CHECK (
    app.has_action('assessment.submit')
    AND mentor_id = app.current_user_id()
  );

-- ── criteria ───────────────────────────────────────────────────────────
/**
 * Visible with the assessment they belong to, expressed as an EXISTS over
 * `assessments` rather than by restating who may read one. The subquery runs
 * under RLS too, so it answers exactly what `assessments_select` answers, and
 * a restated copy is the one that would eventually show a parent the four
 * scores behind another family's report.
 */
DROP POLICY IF EXISTS assessment_criteria_select ON assessment_criteria;
CREATE POLICY assessment_criteria_select ON assessment_criteria
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_id));

DROP POLICY IF EXISTS assessment_criteria_write ON assessment_criteria;
CREATE POLICY assessment_criteria_write ON assessment_criteria
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_id AND a.mentor_id = app.current_user_id()
    )
    AND app.has_action('assessment.submit')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_id AND a.mentor_id = app.current_user_id()
    )
    AND app.has_action('assessment.submit')
  );

-- ── the soft lock ──────────────────────────────────────────────────────
/**
 * Claims are staff-only in both directions, and INTERNAL.
 *
 * A family never reads this table: a claim row says which mentor is about to
 * evaluate their child and when the lock lapses, which is scheduling detail
 * about the team, not information about the student. They see the RESULT.
 *
 * Any mentor may release any claim, which sounds loose and is the point, 
 * FR-ASN-2 calls it a *soft* lock. A mentor who goes on leave holding six
 * claims must not be able to block six children from being assessed, and the
 * 24-hour expiry is the backstop for the case where nobody thinks to.
 */
DROP POLICY IF EXISTS assessment_claims_select ON assessment_claims;
CREATE POLICY assessment_claims_select ON assessment_claims
  FOR SELECT TO authenticated
  USING (app.has_page('/assessments'));

DROP POLICY IF EXISTS assessment_claims_write ON assessment_claims;
CREATE POLICY assessment_claims_write ON assessment_claims
  FOR ALL TO authenticated
  USING (app.has_action('assessment.submit'))
  WITH CHECK (app.has_action('assessment.submit'));

-- ── the family's reply ─────────────────────────────────────────────────
/**
 * The one write on this whole surface that is NOT a mentor's.
 *
 * FR-ASV-4 gives the reaction to the family, and it is authorised by OWNERSHIP
 * rather than a verb, none of the seventeen means "thank my child's mentor",
 * and pressing it is not an administrative act. Staff read reactions (that is
 * the feedback loop the field exists for) and cannot write one: a mentor
 * marking their own assessment "helpful" would make the number describe the
 * staff rather than the families, which is the same rule
 * `material_progress_write` enforces for the same reason.
 */
DROP POLICY IF EXISTS assessment_reactions_select ON assessment_reactions;
CREATE POLICY assessment_reactions_select ON assessment_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_id));

DROP POLICY IF EXISTS assessment_reactions_write ON assessment_reactions;
CREATE POLICY assessment_reactions_write ON assessment_reactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_id AND app.owns_student(a.student_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_id AND app.owns_student(a.student_id)
    )
  );
