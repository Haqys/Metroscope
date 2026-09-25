import { handler, ok, uuidParam } from '@/lib/http/handler';
import { purgeMedia } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Destroy the bytes. Only from the recycle bin, only with nothing pointing at
 * it, and irreversibly, the two checks are in the service, not here, because
 * they are business rules rather than routing.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.publish',
    // Its own key: two limits on one key share a Redis prefix and fight.
    rateLimit: { key: 'media.purge', limit: 20, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await purgeMedia(ctx, uuidParam(params))),
);
