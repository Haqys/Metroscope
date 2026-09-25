import { listArticles } from '@/lib/articles-api';
import { ORGANIZATION } from '@/lib/organization';
import { SITE, absolute } from '@/lib/seo';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  `/rss.xml`, doc 13 §10.6 lists it beside `/sitemap.xml`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Articles only. A feed is a chronological stream of new writing; programmes,
 * mentor profiles and marketing pages are none of those. They are edited, not
 * published in sequence, and putting them in a feed would push the same
 * programme at every subscriber each time somebody fixed a typo in its price.
 *
 * Statically cached and purged by the `articles` tag, exactly like every page
 * that renders an article. `revalidate` is the backstop, not the mechanism.
 */
export const dynamic = 'force-static';
export const revalidate = 300;

/** Twenty is the convention, and enough that a reader catching up loses nothing. */
const ITEMS = 20;

/**
 * XML escaping, applied to every interpolated value without exception.
 *
 * Not defensive coding, article titles are written by humans in Indonesian and
 * an ampersand in "Debat & Public Speaking" is enough to make the whole
 * document unparseable. A feed reader does not degrade on malformed XML the way
 * a browser does with HTML; it rejects the file and shows the subscriber
 * nothing.
 */
function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RSS 2.0 wants RFC 822; `toUTCString()` emits the RFC 1123 form readers expect. */
function rfc822(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toUTCString();
}

export async function GET() {
  const { items } = await listArticles({ perPage: ITEMS });

  const entries = items
    .map((article) => {
      const url = absolute(`/articles/${article.slug}`);
      const published = rfc822(article.publishedAt);

      return [
        '    <item>',
        `      <title>${xml(article.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        /**
         * The URL as a permanent identifier. A reader that has seen this guid
         * will not show the item again, which is why it must not be derived
         * from anything an editor can change after publishing, and why it is
         * the canonical article URL rather than, say, the title.
         */
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        published ? `      <pubDate>${xml(published)}</pubDate>` : null,
        article.excerpt ? `      <description>${xml(article.excerpt)}</description>` : null,
        article.authorName ? `      <dc:creator>${xml(article.authorName)}</dc:creator>` : null,
        article.categoryName ? `      <category>${xml(article.categoryName)}</category>` : null,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  /**
   * `lastBuildDate` is the newest article, not the current time.
   *
   * `now()` would tell every subscriber the feed changed on every poll, which
   * is the same lie `lastmod: new Date()` would be in the sitemap, and here it
   * costs a reader an unread badge for nothing.
   */
  const newest = rfc822(items[0]?.publishedAt ?? null);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(`${ORGANIZATION.name}. Artikel`)}</title>
    <link>${xml(absolute('/articles'))}</link>
    <description>Cerita prestasi siswa, tips lomba, dan panduan orang tua dari mentor ${xml(ORGANIZATION.name)}.</description>
    <language>id</language>
    <atom:link href="${xml(`${SITE}/rss.xml`)}" rel="self" type="application/rss+xml" />
${newest ? `    <lastBuildDate>${xml(newest)}</lastBuildDate>\n` : ''}${entries}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      /**
       * A CDN hint alongside the ISR cache: feed readers poll on their own
       * schedule and a popular feed is fetched far more often than it changes.
       */
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
