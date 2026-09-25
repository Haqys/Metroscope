import type { MetadataRoute } from 'next';

import { listSitemapEntries } from '@/lib/seo-api';
import { absolute } from '@/lib/seo';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  `/sitemap.xml`, doc 13 §5.2, doc 14 §2.8.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two sources, and the split is deliberate. The API knows what is PUBLISHED,
 * it is the only thing that can, because publication is a row state behind RLS.
 * This file knows what routes the SITE SERVES, which the API has no business
 * knowing. Neither could produce the list alone, and putting the static routes
 * in the API would mean a marketing page added here silently never appears.
 *
 * Revalidated by the `sitemap` tag, which the publishing pipeline emits for
 * every content type that has a public URL. The 300s below is the backstop for
 * a purge that never arrives, not the mechanism.
 */
export const revalidate = 300;

/**
 * Routes this site serves itself, in rough order of importance to a reader.
 *
 * `/login` is absent on purpose: it is a form, it ranks for nothing, and it
 * competes with `/register` for the same queries. It carries `noindex` for the
 * same reason. `/preview` is absent because it renders unpublished content.
 */
const STATIC_PATHS = [
  '/',
  '/programs',
  '/articles',
  '/mentors',
  '/testimonials',
  '/faq',
  '/about',
  '/contact',
  '/register',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await listSitemapEntries();

  /**
   * Keyed by path, static first, so a first-party route always wins.
   *
   * A CMS page may be slugged `programs`; Next matches static segments before
   * the `[slug]` catch-all, so that page never renders and `/programs` is the
   * real programme index. Listing it twice would put two `<url>` entries with
   * the same `<loc>` in one sitemap, which is malformed rather than merely
   * redundant.
   */
  const byPath = new Map<string, MetadataRoute.Sitemap[number]>();

  for (const path of STATIC_PATHS) {
    /**
     * No `lastModified` on static routes.
     *
     * There is no honest value: `/about` changes when somebody edits the file,
     * which this route cannot see, and `new Date()` would claim every page on
     * the site changed on every crawl. Google says it uses `lastmod` when a site
     * is consistently accurate about it, a field that is always "now" is how a
     * site teaches it to stop.
     */
    byPath.set(path, { url: absolute(path) });
  }

  for (const entry of entries) {
    if (byPath.has(entry.path)) continue;
    byPath.set(entry.path, {
      url: absolute(entry.path),
      ...(entry.lastModified ? { lastModified: new Date(entry.lastModified) } : {}),
    });
  }

  /**
   * `changeFrequency` and `priority` are omitted, not forgotten. Google ignores
   * both outright, and inventing "0.8" for a programme page and "0.6" for an
   * article is a number with no method behind it, noise that reads as signal
   * to whoever maintains this next.
   */
  return [...byPath.values()];
}
