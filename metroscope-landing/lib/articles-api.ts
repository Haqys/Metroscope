import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_ARTICLES, MOCK_ARTICLE_CARDS, MOCK_TAXONOMY } from '@/lib/mock/content';
import customArticles from '@/lib/mock/custom-articles.json';
import {
  getPublicSupabaseClient,
  toArticleCard,
  toPublicArticle,
  type SupabaseRow,
} from '@/lib/supabase-articles';

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

interface CustomArticleJson {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  excerpt?: string | null;
  locale?: string;
  featured?: boolean;
  readingMin?: number;
  publishedAt?: string | null;
  updatedAt?: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  authorName?: string | null;
  coverUrl?: string | null;
  coverAlt?: string | null;
  tags?: { name: string; slug: string }[];
  body?: ProseNode;
  status?: string;
}

function getLocalCustomArticles(): { cards: ArticleCard[]; full: PublicArticle[] } {
  const list = (Array.isArray(customArticles) ? customArticles : []) as CustomArticleJson[];
  const published = list.filter((a) => !a.status || a.status === 'PUBLISHED');

  const cards: ArticleCard[] = published.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle ?? null,
    excerpt: a.excerpt ?? null,
    locale: a.locale || 'id',
    featured: Boolean(a.featured),
    readingMin: a.readingMin || 5,
    publishedAt: a.publishedAt ?? new Date().toISOString(),
    updatedAt: a.updatedAt ?? new Date().toISOString(),
    categorySlug: a.categorySlug ?? null,
    categoryName: a.categoryName ?? null,
    authorName: a.authorName ?? 'Metroscope Academic Board',
    coverUrl: a.coverUrl ?? null,
    coverAlt: a.coverAlt ?? null,
    coverWidth: null,
    coverHeight: null,
    tags: a.tags ?? [],
  }));

  const full: PublicArticle[] = published.map((a, i) => ({
    ...cards[i]!,
    body:
      a.body ?? {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: a.excerpt || a.title }] }],
      },
    categoryDescription: null,
    viewCount: 0,
    seoTitle: null,
    seoDescription: null,
    seoCanonical: null,
    seoOgImageUrl: null,
    seoNoindex: false,
    seoJsonLd: null,
    related: [],
  }));

  return { cards, full };
}

async function fetchFromInternalCms<T>(path: string): Promise<T | null> {
  const internalUrl = process.env.INTERNAL_URL || 'http://localhost:3002';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${internalUrl}/api/published-articles${path}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.data ?? null) as T;
  } catch {
    return null;
  }
}

export async function listArticles(query: ArticleQuery = {}): Promise<ArticleListPage> {
  const supabase = getPublicSupabaseClient();
  let supabaseItems: ArticleCard[] | null = null;

  if (supabase) {
    try {
      let req = supabase
        .from('articles')
        .select('*')
        .eq('status', 'PUBLISHED')
        .order('published_at', { ascending: false });

      if (query.category) req = req.eq('category_slug', query.category);
      if (query.featured) req = req.eq('featured', true);

      const { data, error } = await req;
      if (!error && data && data.length > 0) {
        let mapped = data.map((d) => toArticleCard(d as SupabaseRow));
        if (query.tag) {
          mapped = mapped.filter((a) => a.tags.some((t) => t.slug === query.tag));
        }
        if (query.q) {
          const needle = query.q.toLowerCase();
          mapped = mapped.filter(
            (a) =>
              a.title.toLowerCase().includes(needle) ||
              (a.excerpt ?? '').toLowerCase().includes(needle) ||
              (a.subtitle ?? '').toLowerCase().includes(needle),
          );
        }
        supabaseItems = mapped;
      }
    } catch (err) {
      logger.warn('public_articles_supabase_fetch_failed', { err });
    }
  }

  if (supabaseItems !== null && supabaseItems.length > 0) {
    const perPage = query.perPage ?? 9;
    const page = query.page ?? 1;
    return {
      items: supabaseItems.slice((page - 1) * perPage, page * perPage),
      total: supabaseItems.length,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(supabaseItems.length / perPage)),
    };
  }

  if (STANDALONE) {
    const remote = await fetchFromInternalCms<{
      items: ArticleCard[];
      fullArticles: PublicArticle[];
      total: number;
    }>('');

    const { cards: localCustomCards } = getLocalCustomArticles();

    let allItems: ArticleCard[] = [];
    if (remote && remote.items && remote.items.length > 0) {
      allItems = remote.items;
    } else {
      const mergedCustom = localCustomCards.filter(
        (c) => !MOCK_ARTICLE_CARDS.some((m) => m.slug === c.slug),
      );
      allItems = [...mergedCustom, ...MOCK_ARTICLE_CARDS];
    }

    let filtered = allItems;
    if (query.category) filtered = filtered.filter((a) => a.categorySlug === query.category);
    if (query.tag) filtered = filtered.filter((a) => a.tags.some((t) => t.slug === query.tag));
    if (query.featured) filtered = filtered.filter((a) => a.featured);
    if (query.q) {
      const needle = query.q.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(needle) ||
          (a.excerpt ?? '').toLowerCase().includes(needle),
      );
    }
    const perPage = query.perPage ?? 9;
    const page = query.page ?? 1;
    return {
      items: filtered.slice((page - 1) * perPage, page * perPage),
      total: filtered.length,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(filtered.length / perPage)),
    };
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return get<ArticleListPage>(`/articles${qs.size ? `?${qs}` : ''}`, ['articles'], EMPTY_PAGE);
}

export async function getArticle(slug: string): Promise<PublicArticle | null> {
  const supabase = getPublicSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'PUBLISHED')
        .maybeSingle();

      if (!error && data) {
        return toPublicArticle(data as SupabaseRow);
      }
    } catch (err) {
      logger.warn('public_article_supabase_fetch_failed', { slug, err });
    }
  }

  if (STANDALONE) {
    const remote = await fetchFromInternalCms<PublicArticle>(`?slug=${encodeURIComponent(slug)}`);
    if (remote) return remote;

    const { full: localCustomFull } = getLocalCustomArticles();
    const localHit = localCustomFull.find((a) => a.slug === slug);
    if (localHit) return localHit;

    return MOCK_ARTICLES.find((a) => a.slug === slug) ?? null;
  }
  return get<PublicArticle | null>(`/articles/${slug}`, ['articles', `article:${slug}`], null);
}

export async function getTaxonomy(): Promise<Taxonomy> {
  const supabase = getPublicSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('category_slug, category_name, tags')
        .eq('status', 'PUBLISHED');

      if (!error && data && data.length > 0) {
        const catMap = new Map<
          string,
          { slug: string; name: string; description: string | null; articleCount: number }
        >();
        const tagMap = new Map<string, { slug: string; name: string; articleCount: number }>();

        for (const cat of MOCK_TAXONOMY.categories) {
          catMap.set(cat.slug, { ...cat, articleCount: 0 });
        }

        for (const row of data) {
          if (row.category_slug && row.category_name) {
            const existing = catMap.get(row.category_slug) || {
              slug: row.category_slug,
              name: row.category_name,
              description: null,
              articleCount: 0,
            };
            existing.articleCount += 1;
            catMap.set(row.category_slug, existing);
          }
          if (Array.isArray(row.tags)) {
            for (const t of row.tags) {
              if (t.slug && t.name) {
                const existing = tagMap.get(t.slug) || {
                  slug: t.slug,
                  name: t.name,
                  articleCount: 0,
                };
                existing.articleCount += 1;
                tagMap.set(t.slug, existing);
              }
            }
          }
        }

        return {
          categories: Array.from(catMap.values()),
          tags: Array.from(tagMap.values()),
        };
      }
    } catch {}
  }

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
