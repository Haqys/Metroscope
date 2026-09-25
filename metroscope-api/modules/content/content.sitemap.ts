import { sql } from 'drizzle-orm';
import { asAnon } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { allTypes, identifier, type ContentType } from './content.registry';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Every indexable URL this site publishes (doc 13 §5.2, doc 14 §2.8).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Derived from the registry, not from a list somebody maintains.** Any
 * content type that declares a `publicPath` has URLs; the ones that do not
 * (FAQ entries, testimonials. They are rendered inside other pages) have none,
 * and are skipped by the same declaration that already tells the pipeline not
 * to write a 301 when they are renamed. So the seventh content type appears in
 * the sitemap on the day it is registered, which is the only way a sitemap
 * stays true: the alternative is a file that silently stops listing a whole
 * section and looks fine forever.
 *
 * **`asAnon`, so RLS decides what is public**: the same reason every other
 * public read does. A sitemap is the one document whose entire job is to hand a
 * crawler a list of URLs to fetch, so a draft leaking into it is not a cosmetic
 * bug: it is an invitation, sent to Google, to go and read unpublished copy
 * about a named child. Repeating `WHERE status = 'PUBLISHED'` here would be a
 * second opinion about publication, and the day it disagrees with the policy is
 * the day the invitation goes out.
 *
 * **`noindex` is honoured.** An editor who marks a page `noindex` has said it
 * must not compete in search; listing it in the sitemap says the opposite, to
 * the same crawler, in the same breath. `seo_meta` is LEFT JOINed rather than
 * required, most content has no override row at all.
 */

export interface SitemapEntry {
  /** Site-relative, always starting with `/`. The site prefixes its origin. */
  path: string;
  /** ISO 8601, or null when the row has no usable timestamp. */
  lastModified: string | null;
  /** Registry key or `category` / `tag`. Lets the site group without guessing. */
  type: string;
}

/**
 * Article hub paths (doc 02 §1.2, doc 13 §10.6).
 *
 * They live here, beside the registry's own `publicPath` functions, because
 * that is where this system keeps the shape of a public URL. A category hub is
 * a page a search engine should rank, doc 13 lists it as an indexable
 * surface, but it is not a content type: it has no row, no status and no
 * editorial pipeline, so it cannot come from `allTypes()`.
 */
const CATEGORY_PATH = (slug: string) => `/articles/kategori/${slug}`;
const TAG_PATH = (slug: string) => `/articles/tag/${slug}`;

type Tx = Parameters<Parameters<typeof asAnon>[0]>[0];

async function entriesForType(tx: Tx, type: ContentType): Promise<SitemapEntry[]> {
  const publicPath = type.publicPath!;
  const rows = await tx.execute<{ slug: string; lastModified: unknown }>(sql`
    SELECT c.${identifier(type.slugColumn!)} AS slug,
           c.${identifier(type.updatedAtColumn ?? 'created_at')} AS "lastModified"
    FROM ${identifier(type.table)} c
    LEFT JOIN seo_meta s ON s.entity_type = ${type.key} AND s.entity_id = c.id
    WHERE COALESCE(s.noindex, false) = false
  `);

  return (Array.from(rows) as { slug: string; lastModified: unknown }[])
    .filter((row) => typeof row.slug === 'string' && row.slug.length > 0)
    .map((row) => ({
      type: type.key,
      path: publicPath(row.slug),
      lastModified: toIso(row.lastModified),
    }));
}

export async function listSitemapEntries(): Promise<SitemapEntry[]> {
  /**
   * A type with a slug column but no public path has no URL; a type with a
   * public path but no slug column cannot build one. Both filters are the
   * registry answering, not this module deciding.
   */
  const types = allTypes().filter((t) => t.publicPath !== null && t.slugColumn !== null);

  return asAnon(async (tx) => {
    const entries: SitemapEntry[] = [];
    for (const type of types) entries.push(...(await entriesForType(tx, type)));

    /**
     * Hubs are listed only where they have something to show.
     *
     * The JOIN does that on its own: under `anon` only published articles are
     * visible, so a category holding nothing but drafts produces no row. An
     * empty hub in a sitemap is a URL a crawler fetches, finds bare, and learns
     * to trust less, and for a category it would also hint at unpublished work
     * by name.
     *
     * `lastmod` is the newest article in the hub, which is exactly what changed
     * about the hub.
     */
    const categories = await tx.execute<{ slug: string; lastModified: unknown }>(sql`
      SELECT c.slug, max(a.updated_at) AS "lastModified"
      FROM article_categories c
      JOIN articles a ON a.category_id = c.id
      GROUP BY c.slug
    `);
    for (const row of Array.from(categories) as { slug: string; lastModified: unknown }[]) {
      entries.push({
        type: 'category',
        path: CATEGORY_PATH(row.slug),
        lastModified: toIso(row.lastModified),
      });
    }

    const tags = await tx.execute<{ slug: string; lastModified: unknown }>(sql`
      SELECT t.slug, max(a.updated_at) AS "lastModified"
      FROM tags t
      JOIN article_tags at ON at.tag_id = t.id
      JOIN articles a ON a.id = at.article_id
      GROUP BY t.slug
    `);
    for (const row of Array.from(tags) as { slug: string; lastModified: unknown }[]) {
      entries.push({
        type: 'tag',
        path: TAG_PATH(row.slug),
        lastModified: toIso(row.lastModified),
      });
    }

    /**
     * Newest first, then by path so the output is stable between calls.
     *
     * Unbounded on purpose. A sitemap file may hold 50,000 URLs; past that the
     * site must split it (`generateSitemaps()` plus a sitemap index) rather than
     * this query silently truncating, because a URL missing from a sitemap is
     * invisible in exactly the way nobody notices.
     */
    return entries.sort(
      (a, b) =>
        (b.lastModified ?? '').localeCompare(a.lastModified ?? '') || a.path.localeCompare(b.path),
    );
  });
}
