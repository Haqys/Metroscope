import { handler, ok } from '@/lib/http/handler';
import { ListMediaQuery, RequestUpload } from '@/modules/media/media.schema';
import { listMedia, requestUpload } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Browse the library: search, folder, kind, missing-alt, recycle bin. */
export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    query: ListMediaQuery,
    rateLimit: { key: 'media.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listMedia(ctx, query)),
);

/**
 * Reserve an asset and get a signed URL to upload to.
 *
 * `ownerWrite` rather than an action verb: adding an image is authoring, and
 * requiring a publishing grant would mean an author cannot illustrate their own
 * draft. RLS agrees, `media_assets_insert` asks for the `/site` page.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: RequestUpload,
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await requestUpload(ctx, body), { status: 201 }),
);
