import { handler, ok, uuidParam } from '@/lib/http/handler';
import { withdrawRequest } from '@/modules/scheduling/reschedule.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The family takes the question back, `ownerWrite`, and the only status
 * transition that path may make. The service pins it to WITHDRAWN and to a
 * PENDING row the caller filed themselves.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    audit: 'session.reschedule-withdrawn',
    rateLimit: { key: 'reschedule.request', limit: 20, window: '1 h' },
  },
  async ({ ctx, params }) => ok(await withdrawRequest(ctx, uuidParam(params))),
);
