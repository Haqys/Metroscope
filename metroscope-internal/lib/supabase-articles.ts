import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ArticleListItem, ProseNode } from './api';

let cachedClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
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

export interface SupabaseArticleRow {
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
  blocks: any[] | null;
  created_at?: string;
}

export function rowToArticleItem(row: SupabaseArticleRow): ArticleListItem {
  const categorySlug =
    row.category_slug ||
    (row.category_name
      ? row.category_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      : 'general');

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    slug: row.slug,
    locale: row.locale || 'id',
    status: row.status as any,
    version: 1,
    excerpt: row.excerpt,
    body: (row.body as ProseNode) || { type: 'doc', content: [] },
    featured: Boolean(row.featured),
    pinnedRank: row.featured ? 1 : null,
    readingMin: row.reading_min || 5,
    viewCount: 0,
    publishAt: row.published_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at || new Date().toISOString(),
    categoryId: `cat-${categorySlug}`,
    categoryName: row.category_name || 'General',
    authorId: 'author-metroscope',
    authorName: row.author_name || 'Metroscope Academic Board',
    coverId: `cov-${row.id}`,
    coverKey: null,
    coverUrl: row.cover_url,
    coverAlt: row.cover_alt || row.title,
    competitionTargetId: null,
    studentId: null,
    consentSource: 'METROSCOPE_CONSENT_REGISTRY',
    tags: Array.isArray(row.tags) ? (row.tags as any) : [],
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
  } as ArticleListItem;
}

export function articleItemToRow(item: any): Partial<SupabaseArticleRow> {
  const categoryName = item.categoryName || 'General';
  const categorySlug =
    item.categorySlug ||
    categoryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const slug =
    item.slug ||
    item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) ||
    `art-${Date.now()}`;

  const isPublished = item.status === 'PUBLISHED';

  return {
    id: item.id || `art-${Date.now()}`,
    slug,
    title: item.title,
    subtitle: item.subtitle || null,
    excerpt: item.excerpt || null,
    locale: item.locale || 'id',
    status: item.status || 'PUBLISHED',
    featured: Boolean(item.featured),
    reading_min: item.readingMin || 5,
    published_at: isPublished
      ? item.publishedAt || new Date().toISOString()
      : item.publishedAt || null,
    updated_at: new Date().toISOString(),
    category_slug: categorySlug,
    category_name: categoryName,
    author_name: item.authorName || 'Metroscope Academic Board',
    cover_url: item.coverUrl || null,
    cover_alt: item.coverAlt || item.title,
    tags: Array.isArray(item.tags)
      ? item.tags.map((t: any) =>
          typeof t === 'string'
            ? { name: t, slug: t.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
            : { name: t.name || '', slug: t.slug || '' },
        )
      : [],
    body: item.rawBody || item.body || { type: 'doc', content: [] },
    blocks: Array.isArray(item.blocks) ? item.blocks : [],
  };
}

export async function fetchArticlesFromSupabase(): Promise<ArticleListItem[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false });

    if (error) {
      console.warn('fetchArticlesFromSupabase error:', error.message);
      return null;
    }

    if (!data || data.length === 0) return [];
    return data.map((row) => rowToArticleItem(row as SupabaseArticleRow));
  } catch (err) {
    console.warn('fetchArticlesFromSupabase exception:', err);
    return null;
  }
}

export async function saveArticleToSupabase(item: any): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const row = articleItemToRow(item);
    const { error } = await supabase
      .from('articles')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.warn('saveArticleToSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('saveArticleToSupabase exception:', err);
    return false;
  }
}

export async function deleteArticleFromSupabase(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('articles')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('deleteArticleFromSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('deleteArticleFromSupabase exception:', err);
    return false;
  }
}

export async function updateArticleStatusInSupabase(
  id: string,
  status: 'PUBLISHED' | 'DRAFT',
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const patch: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'PUBLISHED') {
      patch.published_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('articles')
      .update(patch)
      .eq('id', id);

    if (error) {
      console.warn('updateArticleStatusInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('updateArticleStatusInSupabase exception:', err);
    return false;
  }
}
