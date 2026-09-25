import type { MetadataRoute } from 'next';

import { SITE } from '@/lib/seo';
import { STANDALONE } from '@/lib/standalone';

/**
 * `/robots.txt`, doc 13 §5.2, doc 14 §2.8.
 *
 * Crawl everything except two paths, and point at the sitemap.
 *
 * **`/preview` is disallowed even though it already sends `noindex`.** The two
 * are not the same instruction and the choice between them is real: `noindex`
 * lets the crawler FETCH the page and then decline to index it, which means
 * Google downloads unpublished copy about named students on every preview link
 * it ever discovers. `Disallow` means it never fetches at all. The usual
 * argument against. That a disallowed URL can still be indexed URL-only, from
 * a link, without its `noindex` ever being read, needs a public link to exist,
 * and a preview URL is a signed one-hour token nobody publishes. Both are kept:
 * the meta tag covers a crawler that ignores robots.txt.
 *
 * `/api` is the site's own server routes, the revalidate hook, the contact and
 * registration proxies. Nothing there renders.
 */
export default function robots(): MetadataRoute.Robots {
  /**
   * A standalone deployment is a review copy, and its content is invented:
   * sample programmes, sample prices, written-not-collected testimonials, and
   * competition deadlines that are arithmetic rather than fact
   * (`lib/mock/content.ts`).
   *
   * Indexing that does lasting damage rather than temporary: the sample pages
   * compete with the real site for its own name, a cached price can be quoted
   * back by a parent months later, and a preview URL that ranks is one more
   * thing to get de-indexed after launch. Blocking here and `noindex` on every
   * page are kept as two independent instructions for the same reason
   * `/preview` has both: one stops the crawl, the other covers a crawler that
   * ignores robots.txt.
   */
  if (STANDALONE) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/preview'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
