import { handler, ok } from '@/lib/http/handler';
import { PublicArticleQuery } from '@/modules/articles/articles.schema';
import { listPublicArticles } from '@/modules/articles/articles.public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Published articles for the public website (doc 13 §10.6).
 *
 * Separate from `/v1/site/articles`, which is the editorial list and requires
 * the `/site` page grant. Not the same endpoint with a looser gate: this one
 * runs as `anon` so RLS decides what is visible, returns no body AST, and
 * exposes no draft, author id or review note. One endpoint serving both would
 * have to strip fields by caller, and the day that strip is wrong, an
 * unpublished article about a named child is on the open web.
 */
export const GET = handler(
  {
    auth: 'public',
    query: PublicArticleQuery,
    rateLimit: { key: 'public.articles', limit: 120, window: '1 m' },
  },
  async ({ query }) => ok(await listPublicArticles(query)),
);
