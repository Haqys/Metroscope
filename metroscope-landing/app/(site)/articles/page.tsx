import type { Metadata } from 'next';

import { ArticleIndex } from '@/components/marketing/article-index';
import { listArticles, getTaxonomy } from '@/lib/articles-api';
import { absolute, social } from '@/lib/seo';

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

const DESCRIPTION =
  'Student achievement stories, competition tips, and parent guides from Metroscope mentors.';
const URL = absolute('/articles');
const SOCIAL = social({ title: 'Articles · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Articles',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * The blog index, featured + latest, category filter, tag chips, search and
 * pagination (doc 13 §10.6).
 *
 * Every article on this page comes from `/v1/public/articles`; the fixture that
 * used to back `/porto` is deleted. Cached by the `articles` tag, so publishing
 * purges it, see `lib/articles-api.ts`.
 */
export default async function ArticlesPage({ searchParams }: PageProps) {
  const { q, page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);

  const [results, taxonomy, featuredList] = await Promise.all([
    listArticles({ q, page: current, perPage: 9 }),
    getTaxonomy(),
    /**
     * The featured slot is only fetched for the unfiltered first page.
     *
     * Pinning a story above a search result would answer a question nobody
     * asked, and repeating it above page 2 shows the same article twice.
     */
    !q && current === 1 ? listArticles({ featured: true, perPage: 1 }) : Promise.resolve(null),
  ]);

  const featured = featuredList?.items[0] ?? null;

  return (
    <ArticleIndex
      title="Articles"
      description="Student achievement stories, competition tips, and guides for parents."
      results={{
        ...results,
        // The featured article is already shown large; don't repeat it below.
        items: featured ? results.items.filter((a) => a.id !== featured.id) : results.items,
      }}
      taxonomy={taxonomy}
      basePath={q ? `/articles?q=${encodeURIComponent(q)}` : '/articles'}
      q={q}
      featured={featured}
    />
  );
}
