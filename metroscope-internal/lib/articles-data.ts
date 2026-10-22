import fs from 'node:fs';
import path from 'node:path';
import type { Article, ArticleCategory, ArticleListItem, ArticleTag } from './api';
import {
  doc,
  paragraph,
  heading,
  imageNode,
  blockquote,
  bulletList,
  INITIAL_CATEGORIES,
  INITIAL_TAGS,
  INITIAL_ARTICLES,
} from './article-fixtures';

export {
  doc,
  paragraph,
  heading,
  imageNode,
  blockquote,
  bulletList,
  INITIAL_CATEGORIES,
  INITIAL_TAGS,
  INITIAL_ARTICLES,
};

function loadStoredCustomArticles(): Article[] {
  try {
    const filePath = path.join(process.cwd(), 'lib', 'custom-articles.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed as Article[];
    }
  } catch {}
  return [];
}

function persistCustomArticles(articles: Article[]) {
  try {
    const custom = articles.filter(
      (a) => !INITIAL_ARTICLES.some((init) => init.id === a.id),
    );
    const internalPath = path.join(process.cwd(), 'lib', 'custom-articles.json');
    fs.writeFileSync(internalPath, JSON.stringify(custom, null, 2), 'utf-8');

    const landingPath = path.join(process.cwd(), '..', 'metroscope-landing', 'lib', 'mock', 'custom-articles.json');
    if (fs.existsSync(path.dirname(landingPath))) {
      fs.writeFileSync(landingPath, JSON.stringify(custom, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('Failed to persist custom articles to disk:', err);
  }
}

const storedCustom = loadStoredCustomArticles();

/** In-memory article store (persists for the server process lifespan) */
let runtimeArticles: Article[] = [...storedCustom, ...INITIAL_ARTICLES];
const runtimeCategories: ArticleCategory[] = [...INITIAL_CATEGORIES];
const runtimeTags: (ArticleTag & { articleCount: number })[] = [...INITIAL_TAGS];

export function getRuntimeArticles(): Article[] {
  return runtimeArticles;
}

export function getRuntimeArticle(idOrSlug: string): Article | null {
  return (
    runtimeArticles.find((a) => a.id === idOrSlug || a.slug === idOrSlug) ?? null
  );
}

export function getRuntimeCategories(): ArticleCategory[] {
  return runtimeCategories;
}

export function getRuntimeTags(): (ArticleTag & { articleCount: number })[] {
  return runtimeTags;
}

export function saveRuntimeArticle(
  patch: Partial<Article> & { title: string; id?: string },
): Article {
  const existingIndex = patch.id
    ? runtimeArticles.findIndex((a) => a.id === patch.id)
    : -1;

  if (existingIndex >= 0) {
    const existing = runtimeArticles[existingIndex]!;
    const updated: Article = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };
    runtimeArticles[existingIndex] = updated;
    persistCustomArticles(runtimeArticles);
    return updated;
  }

  const slug =
    patch.slug ||
    patch.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) ||
    `artikel-${Date.now()}`;

  const category = runtimeCategories.find((c) => c.id === patch.categoryId);

  const newArticle: Article = {
    id: patch.id || `art-${Date.now()}`,
    slug,
    title: patch.title,
    subtitle: patch.subtitle ?? null,
    excerpt: patch.excerpt ?? null,
    locale: patch.locale ?? 'id',
    status: patch.status ?? 'PUBLISHED',
    version: 1,
    featured: Boolean(patch.featured),
    pinnedRank: patch.featured ? 1 : null,
    readingMin: patch.readingMin ?? 5,
    viewCount: 0,
    publishAt: new Date().toISOString(),
    publishedAt: patch.status === 'PUBLISHED' ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    categoryId: patch.categoryId ?? null,
    categoryName: category?.name ?? patch.categoryName ?? null,
    categorySlug: category?.slug ?? patch.categorySlug ?? null,
    authorId: patch.authorId ?? 'author-metroscope',
    authorName: patch.authorName ?? 'Metroscope Academic Board',
    coverId: patch.coverId ?? null,
    coverKey: null,
    coverUrl: patch.coverUrl ?? null,
    coverAlt: patch.coverAlt ?? patch.title,
    competitionTargetId: null,
    studentId: null,
    studentName: null,
    competitionName: null,
    consentSource: 'METROSCOPE_CONSENT_REGISTRY',
    consentAt: new Date().toISOString(),
    programId: null,
    competitionId: null,
    reviewNote: null,
    tags: patch.tags ?? [],
    body: patch.body ?? doc(paragraph(patch.excerpt || patch.title)),
  };

  runtimeArticles = [newArticle, ...runtimeArticles];
  persistCustomArticles(runtimeArticles);
  return newArticle;
}

export function deleteRuntimeArticle(id: string): boolean {
  const prevCount = runtimeArticles.length;
  runtimeArticles = runtimeArticles.filter((a) => a.id !== id && a.slug !== id);
  if (runtimeArticles.length < prevCount) {
    persistCustomArticles(runtimeArticles);
    return true;
  }
  return false;
}

export function toListItem(a: Article): ArticleListItem {
  return {
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    slug: a.slug,
    locale: a.locale,
    status: a.status,
    version: a.version,
    excerpt: a.excerpt,
    body: a.body,
    featured: a.featured,
    pinnedRank: a.pinnedRank,
    readingMin: a.readingMin,
    viewCount: a.viewCount,
    publishAt: a.publishAt,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    categoryId: a.categoryId,
    categoryName: a.categoryName,
    authorId: a.authorId,
    authorName: a.authorName,
    coverId: a.coverId,
    coverKey: a.coverKey,
    coverUrl: a.coverUrl,
    coverAlt: a.coverAlt,
    competitionTargetId: a.competitionTargetId,
    studentId: a.studentId,
    consentSource: a.consentSource,
    tags: a.tags,
  };
}
