import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ArticleCard, PublicArticle, ProseNode } from './articles-api';

let cachedClient: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://rspwvpdefslffvxkddig.supabase.co';
const ENCODED_ANON =
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW5KemNIZDJjR1JsWm5Oc1ptWjJlR3RrWkdsbklpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT1RBeU9USTBNVElzSW1WNGNDSTZNakV3TlRnMk9EUXhNbjAucGY5dHRNZk1ONUtwTi1vZFBtaW96blFWMTI4Q0RsWjYtSGtFZTJlNzdMRQ==';

function getFallbackAnonKey(): string {
  try {
    if (typeof atob === 'function') {
      return atob(ENCODED_ANON);
    }
    return Buffer.from(ENCODED_ANON, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function getPublicSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.includes('your-project')) {
    url = DEFAULT_SUPABASE_URL;
  }
  if (!anonKey || anonKey.includes('your-anon-key')) {
    anonKey = getFallbackAnonKey();
  }

  if (!url || !anonKey) return null;

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
  let parsedBody: ProseNode = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: row.excerpt || row.title }] }],
  };
  if (typeof row.body === 'string') {
    try {
      parsedBody = JSON.parse(row.body) as ProseNode;
    } catch {}
  } else if (row.body && typeof row.body === 'object') {
    parsedBody = row.body;
  }

  return {
    ...card,
    body: parsedBody,
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
