import type { Metadata } from 'next';

import { PageHeader } from '@/components/portal/page-header';
import { ArticleList } from '@/components/internal/article-list';
import {
  listArticles,
  listArticleCategories,
  listArticleTags,
  type ContentStatus,
} from '@/lib/api';

export const metadata: Metadata = { title: 'Artikel' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; categoryId?: string; tagId?: string }>;
}

/**
 * Artikel, the article workspace (doc 13 §10).
 *
 * Distinct from `/site`, which is the cross-type queue answering "what is
 * waiting on me?". This page answers "where is that piece about the OSN final?",
 * a question about articles specifically, and one the shared queue cannot
 * answer because it has no category, no tag and no search.
 */
export default async function ArticlesPage({ searchParams }: PageProps) {
  const { q, status, categoryId, tagId } = await searchParams;

  const [articles, categories, tags] = await Promise.all([
    listArticles({
      q,
      status: status as ContentStatus | undefined,
      categoryId,
      tagId,
      limit: 100,
    }),
    listArticleCategories(),
    listArticleTags(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Artikel"
        subtitle="Tulis, review, dan terbitkan artikel: prestasi siswa, tips lomba, panduan orang tua."
      />
      <div className="mt-6">
        <ArticleList
          items={articles.items}
          total={articles.total}
          categories={categories.items}
          tags={tags.items}
          filters={{ q, status, categoryId, tagId }}
        />
      </div>
    </div>
  );
}
