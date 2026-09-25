import { handler, ok, uuidParam } from '@/lib/http/handler';
import { restoreMedia } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bring an asset back out of the recycle bin. */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.publish',
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await restoreMedia(ctx, uuidParam(params))),
);
