import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ArticleCard, PublicArticle, ProseNode } from './articles-api';

let cachedClient: SupabaseClient | null = null;

export function getPublicSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !url ||
    !anonKey ||
    url.includes('your-project') ||
    anonKey.includes('your-anon-key')
  ) {
    return null;
  }

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

export interface SupabaseRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  locale: string;
  status: string;
  featured: boolean;
  reading_min: number;
  published_at: string | null;
  updated_at: string;
  category_slug: string | null;
  category_name: string | null;
  author_name: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  tags: { name: string; slug: string }[] | null;
  body: ProseNode | null;
}

export function toArticleCard(row: SupabaseRow): ArticleCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? null,
    excerpt: row.excerpt ?? null,
    locale: row.locale || 'id',
    featured: Boolean(row.featured),
    readingMin: row.reading_min || 5,
    publishedAt: row.published_at,
    updatedAt: row.updated_at || new Date().toISOString(),
    categorySlug: row.category_slug ?? null,
    categoryName: row.category_name ?? null,
    authorName: row.author_name ?? 'Metroscope Academic Board',
    coverUrl: row.cover_url ?? null,
    coverAlt: row.cover_alt ?? row.title,
    coverWidth: null,
    coverHeight: null,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

export function toPublicArticle(row: SupabaseRow): PublicArticle {
  const card = toArticleCard(row);
  return {
    ...card,
    body: row.body ?? {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: row.excerpt || row.title }] }],
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
  };
}
