import { z } from 'zod';
import { handler, ok, uuidParam } from '@/lib/http/handler';
import { releaseClaim } from '@/modules/assessments/assessments.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus dalam format YYYY-MM.')
    .optional(),
});

/**
 * Release a claim.
 *
 * Any mentor may release any claim, and that looseness is the requirement, not
 * an oversight: FR-ASN-2 calls it a **soft** lock. A mentor who goes on leave
 * holding six claims must not be able to block six children from being
 * assessed, and the 24-hour expiry is only the backstop for when nobody thinks
 * to clear it by hand.
 */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'assessment.submit',
    query: Query,
    audit: 'assessment.release',
    rateLimit: { key: 'assessments.claim', limit: 60, window: '1 m' },
  },
  async ({ ctx, params, query }) =>
    ok(await releaseClaim(ctx, uuidParam(params, 'studentId'), query.period)),
);
