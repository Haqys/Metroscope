import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ConfirmUpload } from '@/modules/media/media.schema';
import { confirmUpload } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The browser has finished uploading. Verifies the object really landed before
 * the asset joins the library, otherwise a failed upload shows as a perfectly
 * normal-looking broken image.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: ConfirmUpload,
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await confirmUpload(ctx, uuidParam(params), body)),
);
