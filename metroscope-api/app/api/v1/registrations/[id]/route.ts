import { handler, ok, uuidParam } from '@/lib/http/handler';
import { getLead } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One lead plus its contact history, what `/leads/:id` renders. */
export const GET = handler(
  {
    auth: 'required',
    rateLimit: { key: 'registrations.detail', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await getLead(ctx, uuidParam(params))),
);
