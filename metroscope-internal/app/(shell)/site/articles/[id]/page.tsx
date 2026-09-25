import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ArticleEditor } from '@/components/internal/article-editor';
import { getArticle, listArticleCategories, listArticleTags } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Sunting Artikel' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The article editor, and the internal preview.
 *
 * They are the same page on purpose: an editor previewing a draft reads it
 * through the same endpoint and the same RLS policy that governs editing it.
 * A separate preview route with its own token would be a second way to reach
 * unpublished content, and the weaker of the two is the one that leaks.
 */
export default async function ArticleEditorPage({ params }: PageProps) {
  const { id } = await params;

  const article = await getArticle(id).catch(() => null);
  if (!article) notFound();

  const [categories, tags, session] = await Promise.all([
    listArticleCategories(),
    listArticleTags(),
    requireSession(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/site/articles"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Artikel
      </Link>

      <div className="mt-6">
        <ArticleEditor
          article={article}
          categories={categories.items}
          allTags={tags.items}
          me={{ id: session.id, name: session.displayName || session.fullName }}
        />
      </div>
    </div>
  );
}
