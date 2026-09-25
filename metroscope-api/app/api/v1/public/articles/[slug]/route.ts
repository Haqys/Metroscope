import { handler, ok } from '@/lib/http/handler';
import { ApiError } from '@/lib/http/errors';
import { getPublicArticle } from '@/modules/articles/articles.public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lower-case, hyphenated, the same shape the editor is allowed to save. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * One published article, with SEO overrides and related posts.
 *
 * A miss is a plain 404 here; the landing site asks `/v1/public/redirects`
 * before rendering its own not-found, so a renamed article still resolves.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.articles', limit: 120, window: '1 m' } },
  async ({ params }) => {
    const slug = params.slug ?? '';
    if (!SLUG.test(slug)) throw new ApiError(404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
    return ok(await getPublicArticle(slug));
  },
);
