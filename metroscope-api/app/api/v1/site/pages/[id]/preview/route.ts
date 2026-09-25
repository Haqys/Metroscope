import { handler, ok, uuidParam } from '@/lib/http/handler';
import { createPreviewGrant } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mint a shareable, expiring preview link for an unpublished page (doc 13 §9.5).
 *
 * The token is returned once and stored only as a SHA-256, so this response is
 * the sole copy. `ownerWrite`: an author previewing their own draft is part of
 * writing it, and the grant is scoped to the single page and expires in an hour.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await createPreviewGrant(ctx, 'page', uuidParam(params))),
);
