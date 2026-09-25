import { handler, ok, uuidParam } from '@/lib/http/handler';
import { DeleteMediaQuery, UpdateMedia } from '@/modules/media/media.schema';
import { deleteMedia, getMedia, updateMedia } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  { auth: 'required', page: '/site', rateLimit: { key: 'media.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getMedia(ctx, uuidParam(params))),
);

/** Alt text, caption, title, folder, focal point. Authoring. */
export const PATCH = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: UpdateMedia,
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateMedia(ctx, uuidParam(params), body)),
);

/**
 * Soft delete. Refused while anything points at the asset unless `?force=true`,
 * the caller should see the usage list first.
 */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'content.publish',
    query: DeleteMediaQuery,
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, query, params }) => ok(await deleteMedia(ctx, uuidParam(params), query)),
);
