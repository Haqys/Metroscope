import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { studentAssessments } from '@/modules/assessments/assessments.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus dalam format YYYY-MM.')
    .optional(),
});

/**
 * One student's assessments, doc 03 §API's `GET /students/:id/assessments`.
 *
 * Two callers, one payload: the mentor's form at `/assessments/[id]` and the
 * family's `/portal/assessments`. They ask the same questions, what was
 * scored, by whom, when, and what was written, and `assessments_select` is
 * what makes one of them see only their own children.
 *
 * **No `page` declaration**, deliberately. Gating on `/assessments` would lock
 * out the guardian this endpoint also serves, and gating on `/students` would
 * do the same; the boundary that matters is per-row, and RLS draws it. The
 * accepted identifier is an id or a slug, like `/competitions/[id]`, because
 * the mentor's route is `/assessments/[slug]`.
 */
export const GET = handler(
  {
    auth: 'required',
    query: Query,
    rateLimit: { key: 'assessments.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, params, query }) =>
    ok(await studentAssessments(ctx, String(params.id), query.period)),
);
