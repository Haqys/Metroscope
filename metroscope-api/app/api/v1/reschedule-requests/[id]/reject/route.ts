import { handler, ok, uuidParam } from '@/lib/http/handler';
import { RejectRescheduleBody } from '@/modules/scheduling/reschedule.schema';
import { rejectRequest } from '@/modules/scheduling/reschedule.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: RejectRescheduleBody,
    audit: 'session.reschedule-rejected',
    rateLimit: { key: 'reschedule.decide', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await rejectRequest(ctx, uuidParam(params), body)),
);
