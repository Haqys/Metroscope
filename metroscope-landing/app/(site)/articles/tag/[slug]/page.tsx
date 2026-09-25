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
  const { tags } = await getTaxonomy();
  const tag = tags.find((t) => t.slug === slug);
  if (!tag) return {};

  const url = absolute(`/articles/tag/${slug}`);
  const description = `Artikel Metroscope dengan topik ${tag.name}.`;
  const s = social({ title: `#${tag.name} · Metroscope`, description, url });

  return {
    title: `#${tag.name}`,
    description,
    alternates: { canonical: url },
    openGraph: { ...s.openGraph, type: 'website' },
    twitter: s.twitter,
  };
}

/**
 * Tag hub, indexable, one per tag with at least one published article
 * (doc 13 §10.6).
 *
 * `getTaxonomy()` drops tags with no published article, so a tag that exists
 * only on drafts 404s here rather than serving an empty page that hints at
 * unpublished work.
 */
export default async function TagPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { q, page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);

  const [taxonomy, results] = await Promise.all([
    getTaxonomy(),
    listArticles({ tag: slug, q, page: current, perPage: 9 }),
  ]);

  const tag = taxonomy.tags.find((t) => t.slug === slug);
  if (!tag) notFound();

  const base = `/articles/tag/${slug}${q ? `?q=${encodeURIComponent(q)}` : ''}`;

  return (
    <ArticleIndex
      title={`#${tag.name}`}
      description={`${tag.articleCount} artikel dengan topik ini.`}
      results={results}
      taxonomy={taxonomy}
      basePath={base}
      q={q}
    />
  );
}
