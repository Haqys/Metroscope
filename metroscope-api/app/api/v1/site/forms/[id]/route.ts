import { z } from 'zod';
import { handler, ok, uuidParam } from '@/lib/http/handler';
import { markSubmissionHandled } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mark a contact message handled, or put it back in the queue. */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'lead.approve',
    page: '/leads',
    body: z.object({ handled: z.boolean() }).strict(),
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await markSubmissionHandled(ctx, uuidParam(params), body.handled)),
);
