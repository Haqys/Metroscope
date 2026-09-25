import { sql } from 'drizzle-orm';
import { asAnon } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { ApiError } from '@/lib/http/errors';
import { publicUrl } from '../media/media.service';
import type { PublicArticleQueryInput } from './articles.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The public article surface (doc 13 §10.6, doc 14 §2.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything here runs inside `asAnon`, so **RLS decides what is public**:
 * `articles_select_public` already says `status = 'PUBLISHED'` and nothing else.
 * The alternative, running as the table owner and repeating `WHERE status =
 * 'PUBLISHED'` in each query, means the policy is never exercised on the one
 * path where being wrong publishes a draft. An article awaiting approval is
 * often about a named child and their result; a forgotten predicate in the
 * fifth query would put it on the open web.
 *
 * A scheduled article is not published until the cron flips it, so it is
 * invisible here for the same reason, no `publish_at <= now()` clause is
 * needed or wanted, because two places deciding "is it live?" will disagree.
 */

/** One page of a listing, plus what the pager needs to render itself. */
export interface PublicArticleList {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

/**
 * The card shape. Deliberately excludes `body`.
 *
 * An index of 12 articles would otherwise ship 12 full ProseMirror documents to
 * render 12 excerpts, the payload grows with how much people write, which is
 * exactly backwards.
 */
const CARD = sql`
  a.id, a.slug, a.title, a.subtitle, a.excerpt, a.locale,
  a.featured, a.reading_min AS "readingMin",
  a.published_at AS "publishedAt", a.updated_at AS "updatedAt",
  c.slug AS "categorySlug", c.name AS "categoryName",
  -- Not a join onto users: that table is closed to anon, so the LEFT JOIN
  -- returned NULL and every public byline rendered blank. Nothing errored; the
  -- name was simply absent. The helper returns one column, and only for
  -- accounts that have actually published something.
  app.published_author_name(a.author_id) AS "authorName",
  m.storage_key AS "coverKey", m.alt AS "coverAlt", m.width AS "coverWidth", m.height AS "coverHeight",
  COALESCE(
    (SELECT json_agg(json_build_object('name', t.name, 'slug', t.slug) ORDER BY t.name)
     FROM article_tags at JOIN tags t ON t.id = at.tag_id
     WHERE at.article_id = a.id),
    '[]'::json
  ) AS tags
`;

const JOINS = sql`
  FROM articles a
  LEFT JOIN article_categories c ON c.id = a.category_id
  LEFT JOIN media_assets m ON m.id = a.cover_id
`;

/**
 * Timestamps normalised to ISO 8601 here, at the edge of the module, so no
 * consumer has to know what shape the driver hands back. `lib/db/iso.ts` says
 * why it matters; §2.8's sitemap is the second place it does.
 */
const ISO_FIELDS = ['publishedAt', 'updatedAt'] as const;

function withCover<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((r) => {
    const out: Record<string, unknown> = {
      ...r,
      coverUrl: r.coverKey ? publicUrl(String(r.coverKey)) : null,
    };
    for (const field of ISO_FIELDS) {
      const iso = toIso(out[field]);
      if (iso) out[field] = iso;
    }
    return out;
  });
}

export async function listPublicArticles(
  query: PublicArticleQueryInput,
): Promise<PublicArticleList> {
  const where = [sql`TRUE`];
  if (query.category) where.push(sql`c.slug = ${query.category}`);
  if (query.featured) where.push(sql`a.featured`);
  if (query.tag) {
    where.push(sql`EXISTS (
      SELECT 1 FROM article_tags at JOIN tags t ON t.id = at.tag_id
      WHERE at.article_id = a.id AND t.slug = ${query.tag}
    )`);
  }
  if (query.q) {
    where.push(sql`
      to_tsvector('simple',
        coalesce(a.title,'') || ' ' || coalesce(a.subtitle,'') || ' ' || coalesce(a.excerpt,''))
      @@ plainto_tsquery('simple', ${query.q})
    `);
  }
  const filter = sql.join(where, sql` AND `);
  const offset = (query.page - 1) * query.perPage;

  return asAnon(async (tx) => {
    /**
     * `pinned_rank` first, then newest.
     *
     * Editors need a way to hold one story at the top of the page, a national
     * win during enrolment season, without republishing it to fake a date.
     * NULLS LAST keeps every unpinned article in ordinary reverse-chronological
     * order underneath.
     */
    const rows = await tx.execute(sql`
      SELECT ${CARD} ${JOINS}
      WHERE ${filter}
      ORDER BY a.pinned_rank NULLS LAST, a.published_at DESC NULLS LAST, a.id
      LIMIT ${query.perPage} OFFSET ${offset}
    `);
    const counted = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n ${JOINS} WHERE ${filter}
    `);
    const total = (Array.from(counted) as { n: number }[]).at(0)?.n ?? 0;

    return {
      items: withCover(Array.from(rows) as Record<string, unknown>[]),
      total,
      page: query.page,
      perPage: query.perPage,
      pageCount: Math.max(1, Math.ceil(total / query.perPage)),
    };
  });
}

/**
 * Related articles, rule-based, exactly as doc 13 §10.9 specifies for v1.
 *
 * Same category 3 · shares a tag 2 · same programme 2 · recent 1, top 3,
 * excluding self. Weights are per SIGNAL rather than per shared tag: an article
 * sharing four incidental tags should not outrank one in the same category, and
 * tag overlap is the secondary sort instead so it still breaks ties.
 *
 * "Same competition" from the doc has no column to read, `competitions` does
 * not exist until Phase 3, so that term is absent rather than faked.
 *
 * §10.9 also says not to build a recommendation engine before 50 articles, and
 * this is the reason it is nine lines of SQL rather than a service.
 */
async function relatedTo(
  tx: Parameters<Parameters<typeof asAnon>[0]>[0],
  article: { id: string; category_id: string | null; program_id: string | null },
) {
  const rows = await tx.execute(sql`
    WITH self_tags AS (
      SELECT tag_id FROM article_tags WHERE article_id = ${article.id}
    ),
    signals AS (
      SELECT a.id,
             (${article.category_id}::uuid IS NOT NULL
              AND a.category_id = ${article.category_id}::uuid) AS same_category,
             EXISTS (
               SELECT 1 FROM article_tags at
               WHERE at.article_id = a.id AND at.tag_id IN (SELECT tag_id FROM self_tags)
             ) AS shares_tag,
             (${article.program_id}::uuid IS NOT NULL
              AND a.program_id = ${article.program_id}::uuid) AS same_program,
             (a.published_at > now() - interval '90 days') AS recent,
             (SELECT count(*) FROM article_tags at
              WHERE at.article_id = a.id AND at.tag_id IN (SELECT tag_id FROM self_tags))
             AS shared_tags
      FROM articles a
      WHERE a.id <> ${article.id}
    ),
    scored AS (
      SELECT id, shared_tags,
             (CASE WHEN same_category THEN 3 ELSE 0 END)
           + (CASE WHEN shares_tag    THEN 2 ELSE 0 END)
           + (CASE WHEN same_program  THEN 2 ELSE 0 END)
           + (CASE WHEN recent        THEN 1 ELSE 0 END) AS score,
             -- Recency orders candidates; it does not qualify them. Scored as
             -- a plain +1 into the same total, every article published in the
             -- last 90 days cleared "score > 0", so a piece sharing no
             -- category, no tag and no programme still appeared under "Bacaan
             -- lain". On a young blog that is every article, and the section
             -- degenerates into "three other things we wrote", which is the
             -- failure doc 13 section 10.9 warns about when it says not to
             -- build a recommendation engine yet.
             (same_category OR shares_tag OR same_program) AS substantive
      FROM signals
    )
    SELECT ${CARD}, s.score ${JOINS}
    JOIN scored s ON s.id = a.id
    WHERE s.substantive
    ORDER BY s.score DESC, s.shared_tags DESC, a.published_at DESC NULLS LAST
    LIMIT 3
  `);
  return withCover(Array.from(rows) as Record<string, unknown>[]);
}

/**
 * One published article by slug, with its SEO overrides and related posts.
 *
 * `seo_meta` is LEFT JOINed rather than fetched separately: the page needs it
 * to render `<head>`, and a second round trip for five nullable columns is a
 * second chance to render a page with no description.
 */
export async function getPublicArticle(slug: string) {
  return asAnon(async (tx) => {
    const rows = await tx.execute<
      Record<string, unknown> & {
        id: string;
        category_id: string | null;
        program_id: string | null;
      }
    >(sql`
      SELECT ${CARD},
             a.body, a.category_id, a.program_id, a.view_count AS "viewCount",
             c.description AS "categoryDescription",
             s.title AS "seoTitle", s.description AS "seoDescription",
             s.canonical AS "seoCanonical", s.og_image_key AS "seoOgImageKey",
             s.noindex AS "seoNoindex", s.json_ld AS "seoJsonLd"
      ${JOINS}
      LEFT JOIN seo_meta s ON s.entity_type = 'article' AND s.entity_id = a.id
      WHERE a.slug = ${slug}
    `);
    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Artikel tidak ditemukan.');

    const [withUrl] = withCover([row]);
    return {
      ...withUrl,
      seoOgImageUrl: row.seoOgImageKey ? publicUrl(String(row.seoOgImageKey)) : null,
      related: await relatedTo(tx, row),
    };
  });
}

/**
 * Categories and tags, with counts of PUBLISHED articles only.
 *
 * The count comes from the same `asAnon` transaction as everything else, so a
 * category holding nothing but drafts reports zero rather than advertising a
 * hub page that renders empty, and, worse, hinting at unpublished work.
 *
 * Empty categories are still returned: the index renders the full navigation
 * and marks them, which is a decision for the caller, not this query.
 */
export async function getPublicTaxonomy() {
  return asAnon(async (tx) => {
    const categories = await tx.execute(sql`
      SELECT c.slug, c.name, c.description,
             (SELECT count(*)::int FROM articles a WHERE a.category_id = c.id) AS "articleCount"
      FROM article_categories c
      ORDER BY c.order_index, c.name
    `);
    /**
     * Tags with no published article are dropped, unlike categories.
     *
     * A category is navigation and its absence is a hole in the menu; a tag is
     * a cluster, and an empty one is a chip that leads to an empty page.
     */
    const tags = await tx.execute(sql`
      SELECT t.slug, t.name, count(a.id)::int AS "articleCount"
      FROM tags t
      JOIN article_tags at ON at.tag_id = t.id
      JOIN articles a ON a.id = at.article_id
      GROUP BY t.slug, t.name
      HAVING count(a.id) > 0
      ORDER BY count(a.id) DESC, t.name
    `);
    return { categories: Array.from(categories), tags: Array.from(tags) };
  });
}

/**
 * Resolve a retired path to its replacement (doc 13 §10.8).
 *
 * Consulted only when a slug misses, so the ordinary request pays nothing. The
 * table is public to `anon` by policy because this is exactly what it is for:
 * answering "where did this URL go?" before anyone signs in.
 */
export async function resolveRedirect(fromPath: string) {
  return asAnon(async (tx) => {
    const rows = await tx.execute<{ toPath: string; statusCode: number }>(sql`
      SELECT to_path AS "toPath", status_code AS "statusCode"
      FROM redirects WHERE from_path = ${fromPath}
    `);
    return (Array.from(rows) as { toPath: string; statusCode: number }[]).at(0) ?? null;
  });
}
