import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleIndex } from '@/components/marketing/article-index';
import { listArticles, getTaxonomy } from '@/lib/articles-api';
import { absolute, social } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { categories } = await getTaxonomy();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return {};

  const url = absolute(`/articles/kategori/${slug}`);
  const description =
    category.description ?? `Kumpulan artikel Metroscope dalam kategori ${category.name}.`;
  const s = social({ title: `${category.name} · Metroscope`, description, url });

  return {
    title: category.name,
    description,
    /**
     * The canonical always points at page 1 of the hub, never at `?page=3`.
     *
     * Paginated pages are their own URLs and stay indexable, `rel=prev/next`
     * on the pager says they are one sequence, but the hub's identity is the
     * unparameterised URL, and letting page 3 claim its own canonical is how a
     * category splits its ranking across four near-identical pages.
     */
    alternates: { canonical: url },
    openGraph: { ...s.openGraph, type: 'website' },
    twitter: s.twitter,
  };
}

/**
 * Category hub, indexable, one per category (doc 13 §10.6).
 *
 * Deliberately a distinct route rather than `/articles?category=x`: doc 02 §1.2
 * lists it as its own path because it is a page a search engine should rank,
 * and a query parameter is a filter, not a destination.
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { q, page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);

  const [taxonomy, results] = await Promise.all([
    getTaxonomy(),
    listArticles({ category: slug, q, page: current, perPage: 9 }),
  ]);

  /**
   * An unknown category is a 404, even though the listing would simply come
   * back empty. "This category has nothing yet" and "this category does not
   * exist" are different answers, and only one of them should be indexed.
   */
  const category = taxonomy.categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const base = `/articles/kategori/${slug}${q ? `?q=${encodeURIComponent(q)}` : ''}`;

  return (
    <ArticleIndex
      title={category.name}
      description={category.description}
      results={results}
      taxonomy={taxonomy}
      basePath={base}
      activeCategory={slug}
      q={q}
    />
  );
}
