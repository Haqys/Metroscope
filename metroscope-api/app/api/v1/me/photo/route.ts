import { handler, ok } from '@/lib/http/handler';
import { PhotoUpload } from '@/modules/me/me.schema';
import { createPhotoUpload } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Step one of the avatar handshake: a signed URL the browser PUTs to directly.
 *
 * The bytes never pass through this API. A serverless function has a request
 * body limit and no reason to spend it relaying an image that storage can
 * accept on its own.
 */
export const POST = handler(
  {
    auth: 'required',
    body: PhotoUpload,
    /** The caller is changing their OWN row; users_update_self is the gate. */
    ownerWrite: true,
    rateLimit: { key: 'me.photo', limit: 20, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createPhotoUpload(ctx, body)),
);
