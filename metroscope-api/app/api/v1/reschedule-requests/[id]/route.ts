import { handler, ok, uuidParam } from '@/lib/http/handler';
import { getRequest } from '@/modules/scheduling/reschedule.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  { auth: 'required', rateLimit: { key: 'reschedule.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getRequest(ctx, uuidParam(params))),
);
