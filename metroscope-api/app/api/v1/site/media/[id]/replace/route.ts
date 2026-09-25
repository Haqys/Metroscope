import { handler, ok, uuidParam } from '@/lib/http/handler';
import { RequestUpload } from '@/modules/media/media.schema';
import { requestReplace } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Swap the bytes behind an asset, keeping its id, so every reference picks up
 * the new file instead of staying on the old one.
 *
 * That reach is why it needs `content.publish`: replacing changes what is live
 * everywhere the asset appears, instantly, without passing through the
 * editorial pipeline.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.publish',
    body: RequestUpload,
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await requestReplace(ctx, uuidParam(params), body)),
);
