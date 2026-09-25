import { handler, ok } from '@/lib/http/handler';
import { CoverageQuery, SubmitAssessmentBody } from '@/modules/assessments/assessments.schema';
import { coverage, submitAssessment } from '@/modules/assessments/assessments.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The coverage queue (doc 03 FR-ASN-1, doc 13 §12.9).
 *
 * The index IS the queue, "not a form entry point". Every ACTIVE student ×
 * the period, including the ones with no assessment, because the rows that are
 * missing are the entire product.
 *
 * Gated by the `/assessments` page grant, which doc 13 §8.3 gives to HEAD and
 * MENTOR and to nobody else, not even SECRETARY, who holds `/students` and
 * `student.edit`. Reads are page-gated, writes are verb-gated, and RLS
 * (`assessments_select`) filters underneath either way.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/assessments',
    query: CoverageQuery,
    rateLimit: { key: 'assessments.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await coverage(ctx, query)),
);

/**
 * Submit (FR-ASN-5), gated by `assessment.submit`, the verb the Phase 0 role
 * matrix already gives the Mentor. No new verb: the vocabulary already says
 * exactly this.
 *
 * The body carries four scores and a note. It cannot carry `mentorId` (the
 * policy pins it to the caller), `avgScore` or `category` (a trigger derives
 * both from the criteria), or `pointsAwarded` (a product constant).
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'assessment.submit',
    body: SubmitAssessmentBody,
    audit: 'assessment.submit',
    rateLimit: { key: 'assessments.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await submitAssessment(ctx, body), { status: 201 }),
);
