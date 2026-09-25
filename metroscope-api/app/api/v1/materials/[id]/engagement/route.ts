import { handler, ok, uuidParam } from '@/lib/http/handler';
import { materialEngagement } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Who opened it", doc 13 §12.7's per-material engagement.
 *
 * Lists every ENTITLED student, not only the ones with a progress row. The
 * absence of a row is the finding: forty children given a module and three who
 * opened it is what a mentor needs to see, and a list of three says nothing
 * about the thirty-seven.
 *
 * `page: '/materials'` because this aggregates across families. RLS on
 * `material_progress` would let a guardian read their own child's row, and
 * without the page gate a parent calling this endpoint would receive a roster
 * of one, technically correct, and still an answer to a question that is not
 * theirs to ask.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/materials',
    rateLimit: { key: 'materials.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await materialEngagement(ctx, uuidParam(params))),
);
