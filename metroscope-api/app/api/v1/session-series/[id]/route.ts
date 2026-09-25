import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateSeriesBody } from '@/modules/scheduling/scheduling.schema';
import { updateSeries } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Edit all", doc 06 §7.3, "the single most-requested behaviour in any
 * scheduling product".
 *
 * FUTURE sessions only. A rule change cannot rewrite a lesson that already
 * happened: the mentor taught it and it is in a fee calculation.
 */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: UpdateSeriesBody,
    audit: 'session.series.update',
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateSeries(ctx, uuidParam(params), body)),
);
