import { handler, ok } from '@/lib/http/handler';
import { getPublicTaxonomy } from '@/modules/articles/articles.public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Categories and tags for the article navigation, counting published articles
 * only. One call rather than two: every article surface renders both.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.articles', limit: 120, window: '1 m' } },
  async () => ok(await getPublicTaxonomy()),
);
