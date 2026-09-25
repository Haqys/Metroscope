import { handler, ok } from '@/lib/http/handler';
import { ClaimBody } from '@/modules/assessments/assessments.schema';
import { claimStudent } from '@/modules/assessments/assessments.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * FR-ASN-2, "any mentor may claim an un-assessed student (soft lock, 24h) to
 * prevent two mentors writing the same assessment."
 *
 * A static segment beside `[id]`, which Next resolves first; neither is a UUID
 * so the two can never be confused. The claim is keyed on (student, period),
 * the same slot in the coverage matrix the assessment is unique on, because
 * that is what is being locked, and no assessment row exists yet to hang it on.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'assessment.submit',
    body: ClaimBody,
    audit: 'assessment.claim',
    rateLimit: { key: 'assessments.claim', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await claimStudent(ctx, body), { status: 201 }),
);
