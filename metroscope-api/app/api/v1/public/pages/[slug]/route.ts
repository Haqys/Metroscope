import { handler, ok } from '@/lib/http/handler';
import { ApiError } from '@/lib/http/errors';
import { getPublicPage } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * One published page with its currently-visible blocks.
 *
 * Runs as `anon`, so `pages_select_public` decides what is live, and
 * `page_blocks_select_public`, a subquery over the same RLS-protected table,
 * means a block cannot outlive its page's visibility.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.pages', limit: 120, window: '1 m' } },
  async ({ params }) => {
    const slug = params.slug ?? '';
    if (!SLUG.test(slug)) throw new ApiError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.');
    return ok(await getPublicPage(slug));
  },
);
