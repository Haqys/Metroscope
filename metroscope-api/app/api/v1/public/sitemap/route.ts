import { handler, ok } from '@/lib/http/handler';
import { listSitemapEntries } from '@/modules/content/content.sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every indexable content URL, for the website's `sitemap.xml` (doc 14 §2.8).
 *
 * Paths and timestamps only, no titles, no excerpts, nothing that would make
 * this a second way to read content. The site adds its own static routes and
 * renders the XML; the API answers the one question it alone can answer, which
 * is what is published and when it last changed.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.sitemap', limit: 60, window: '1 m' } },
  async () => ok({ items: await listSitemapEntries() }),
);
