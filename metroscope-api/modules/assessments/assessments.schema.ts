import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Assessments, request shapes (doc 03 FR-ASN/FR-ASV, doc 14 §3.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What is absent matters as much as what is here. No body carries `avgScore`,
 * `category`, `mentorId` or `pointsAwarded`:
 *
 *   avgScore / category, recomputed by migration 0025's trigger from the four
 *                          criteria, so the number a parent reads cannot
 *                          disagree with the numbers it came from;
 *   mentorId, pinned to the caller by `assessments_insert`;
 *   pointsAwarded, a product constant, not a mentor's choice.
 *
 * A field the client cannot send is a field the client cannot get wrong.
 */

export const CRITERIA = ['UNDERSTANDING', 'PARTICIPATION', 'DISCIPLINE', 'READINESS'] as const;
export type CriterionKey = (typeof CRITERIA)[number];

/** `YYYY-MM`, WITA. Matches the CHECK constraint on the column. */
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus dalam format YYYY-MM.');

export const CoverageQuery = z.object({
  /** Defaults to the current WITA month, resolved server-side. */
  period: period.optional(),
  /**
   * FR-ASN-1's two tabs. `all` is the default because the page shows both
   * counts, and two round trips to render one screen is two chances to show
   * a total that does not equal its parts.
   */
  status: z.enum(['all', 'pending', 'done']).default('all'),
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type CoverageInput = z.infer<typeof CoverageQuery>;

/**
 * The four scores, all four required.
 *
 * `.strict()` on a closed object rather than an array of `{criterion, score}`:
 * an array can arrive with three entries, or five, or the same criterion twice,
 * and every one of those is a case the service would have to reject by hand.
 * An object with four required keys cannot express any of them.
 */
export const CriteriaScores = z
  .object({
    UNDERSTANDING: z.number().int().min(0).max(10),
    PARTICIPATION: z.number().int().min(0).max(10),
    DISCIPLINE: z.number().int().min(0).max(10),
    READINESS: z.number().int().min(0).max(10),
  })
  .strict();

export const SubmitAssessmentBody = z.object({
  studentId: z.string().uuid(),
  period: period.optional(),
  scores: CriteriaScores,
  /**
   * FR-ASN-4, shown to the student and the parent, which is why it has a
   * floor. A report card whose only words are "bagus" is not the qualitative
   * note the requirement describes, and the parent reading it cannot tell
   * whether the mentor was brief or the form was skipped.
   */
  note: z.string().trim().min(20, 'Catatan minimal 20 karakter.').max(4000),
});
export type SubmitAssessmentInput = z.infer<typeof SubmitAssessmentBody>;

/** A correction by the author. Same shape, nothing about identity. */
export const UpdateAssessmentBody = z.object({
  scores: CriteriaScores.optional(),
  note: z.string().trim().min(20, 'Catatan minimal 20 karakter.').max(4000).optional(),
});
export type UpdateAssessmentInput = z.infer<typeof UpdateAssessmentBody>;

export const ClaimBody = z.object({
  studentId: z.string().uuid(),
  period: period.optional(),
});
export type ClaimInput = z.infer<typeof ClaimBody>;

/** FR-ASV-4. The family's one reply. */
export const ReactionBody = z.object({
  reaction: z.enum(['HELPFUL', 'MOTIVATING', 'THANKS']),
});
export type ReactionInput = z.infer<typeof ReactionBody>;

export const ListAssessmentsQuery = z.object({
  studentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListAssessmentsInput = z.infer<typeof ListAssessmentsQuery>;
