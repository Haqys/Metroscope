import { handler, ok } from '@/lib/http/handler';
import { ListNotifications } from '@/modules/me/me.schema';
import { listNotifications } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The caller's own notifications, newest first, with an unread count for the
 * bell. `notifications_select` is `user_id = app.current_user_id()`, so there
 * is no filter to get wrong here.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListNotifications,
    rateLimit: { key: 'me.notifs', limit: 240, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listNotifications(ctx, query)),
);
