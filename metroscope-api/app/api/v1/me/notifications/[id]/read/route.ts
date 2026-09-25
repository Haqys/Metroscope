import { handler, ok } from '@/lib/http/handler';
import { markNotificationRead } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(
  {
    auth: 'required',
    /** Marking your OWN notification read; notifications_update is the gate. */
    ownerWrite: true,
    rateLimit: { key: 'me.notifs.read', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await markNotificationRead(ctx, String(params.id))),
);
