import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_ARTICLES, MOCK_TAXONOMY, mockArticlePage } from '@/lib/mock/content';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Published articles, for the public site (doc 13 §10.6, doc 14 §2.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SERVER ONLY. It reads `API_URL`, which is not a `NEXT_PUBLIC_` value, so a
 * client component importing this fails the build rather than shipping the
 * internal hostname to browsers.
 *
 * **Cached by tag, purged by the publish pipeline.** Every request below is
 * tagged with the same strings `content.registry.ts` emits on publish,
 * `articles` for anything that appears in a list, `article:<slug>` for one
 * page. The API's `revalidate()` posts those tags to `/api/revalidate` after
 * the publishing transaction commits, so an editor hitting Terbitkan sees the
 * live site change without a deploy, and readers never wait on an API round
 * trip. `revalidate: 300` is the backstop for a purge that never arrives.
 *
 * No business logic lives here. Filtering, ordering, pagination, related-post
 * scoring and what counts as published are all decided by the API, the site
 * renders what it is given. A `WHERE status = 'PUBLISHED'` on this side would
 * be a second opinion about publication, and the two would eventually differ.
 */

/** A TipTap / ProseMirror node, as stored. Rendered by `article-body.tsx`. */
export interface ProseNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  locale: string;
  featured: boolean;
  readingMin: number;
  publishedAt: string | null;
  updatedAt: string;
  categorySlug: string | null;
  categoryName: string | null;
  authorName: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  tags: { name: string; slug: string }[];
}

export interface PublicArticle extends ArticleCard {
  body: ProseNode;
  categoryDescription: string | null;
  viewCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  seoOgImageUrl: string | null;
  seoNoindex: boolean;
  seoJsonLd: Record<string, unknown> | null;
  related: ArticleCard[];
}

export interface ArticleListPage {
  items: ArticleCard[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

export interface Taxonomy {
  categories: { slug: string; name: string; description: string | null; articleCount: number }[];
  tags: { slug: string; name: string; articleCount: number }[];
}

/** Five minutes, as the floor under tag purges, never instead of them. */
const REVALIDATE = 300;

async function get<T>(path: string, tags: string[], fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiUrl()}/v1/public${path}`, {
      next: { tags, revalidate: REVALIDATE },
    });
    if (!res.ok) {
      // A 404 is an answer, not a fault, the caller renders not-found.
      if (res.status !== 404) logger.warn('public_articles_failed', { path, status: res.status });
      return fallback;
    }
    const body = await res.json();
    return (body?.data ?? fallback) as T;
  } catch (err) {
    /**
     * An empty result, never a thrown page.
     *
     * The index renders "belum ada artikel" and the rest of the site, nav,
     * programmes, the registration CTA, keeps working. A marketing site that
     * 500s in full because a list endpoint blinked loses enquiries for the
     * duration, which is a worse outcome than a section that is briefly bare.
     */
    logger.error('public_articles_unreachable', {
      path,
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

const EMPTY_PAGE: ArticleListPage = { items: [], total: 0, page: 1, perPage: 9, pageCount: 1 };

export interface ArticleQuery {
  category?: string;
  tag?: string;
  q?: string;
  featured?: boolean;
  page?: number;
  perPage?: number;
}

export function listArticles(query: ArticleQuery = {}): Promise<ArticleListPage> {
  if (STANDALONE) return Promise.resolve(mockArticlePage(query));

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  /**
   * Every listing carries the plain `articles` tag, whatever it filters by.
   *
   * Publishing one article changes the index, its category hub, each of its tag
   * hubs and any search that would have matched it. Tagging a listing by its
   * own filter would leave every other listing stale until its own five minutes
   * elapsed, visible to an editor as "it worked on one page but not the next".
   */
  return get<ArticleListPage>(`/articles${qs.size ? `?${qs}` : ''}`, ['articles'], EMPTY_PAGE);
}

export function getArticle(slug: string): Promise<PublicArticle | null> {
  if (STANDALONE) return Promise.resolve(MOCK_ARTICLES.find((a) => a.slug === slug) ?? null);
  return get<PublicArticle | null>(`/articles/${slug}`, ['articles', `article:${slug}`], null);
}

export function getTaxonomy(): Promise<Taxonomy> {
  if (STANDALONE) return Promise.resolve(MOCK_TAXONOMY);
  return get<Taxonomy>('/taxonomy', ['articles'], { categories: [], tags: [] });
}

/**
 * Where a retired URL went (doc 13 §10.8).
 *
 * Uncached deliberately. It is consulted only when a slug has already missed,
 * so it is rare, and a 301 written seconds ago must work immediately: a reader
 * arriving from a search result on the old URL is the exact case the redirect
 * exists for, and caching a `null` would 404 them for the full window.
 */
export async function resolveRedirect(
  fromPath: string,
): Promise<{ toPath: string; statusCode: number } | null> {
  /** No CMS, so no retired URLs to forward. A miss is simply a 404. */
  if (STANDALONE) return null;
  try {
    const res = await fetch(
      `${apiUrl()}/v1/public/redirects?path=${encodeURIComponent(fromPath)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      logger.warn('redirect_lookup_failed', { fromPath, status: res.status });
      return null;
    }
    return (await res.json())?.data ?? null;
  } catch (err) {
    /**
     * Logged, not swallowed.
     *
     * A failed lookup and "there is no redirect" both return null, and the
     * caller turns null into a 404, so an outage here silently converts every
     * renamed article's old URL into a dead end, which is exactly the ranking
     * loss doc 13 §10.8 exists to prevent. Being able to see it is the
     * difference between a bug and a mystery.
     */
    logger.error('redirect_lookup_unreachable', {
      fromPath,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
