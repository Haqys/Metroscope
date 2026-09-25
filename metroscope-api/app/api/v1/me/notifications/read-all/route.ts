import { handler, ok } from '@/lib/http/handler';
import { markAllNotificationsRead } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(
  {
    auth: 'required',
    /** Marking your OWN notification read; notifications_update is the gate. */
    ownerWrite: true,
    rateLimit: { key: 'me.notifs.readall', limit: 30, window: '1 m' },
  },
  async ({ ctx }) => ok(await markAllNotificationsRead(ctx)),
);
