import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { ContentDetail } from '@/components/internal/content-detail';
import { SeoPanel } from '@/components/internal/seo-panel';
import { ConsentPanel } from '@/components/internal/consent-panel';
import { getArticle, listContent, listContentVersions, getContentSeo } from '@/lib/api';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Konten' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string; id: string }>;
}

/**
 * One piece of content: where it is in the pipeline, what can be done to it
 * next, and every version it has ever been.
 *
 * Minimal by intent (doc 14 §2.1). This exists to exercise the workflow, not
 * to be the block editor. The editor arrives with pages in §2.6.
 */
export default async function ContentDetailPage({ params }: PageProps) {
  const { type, id } = await params;

  const [all, versions, seo, article] = await Promise.all([
    listContent({ type, limit: 100 }),
    listContentVersions(type, id).catch(() => ({ items: [] })),
    getContentSeo(type, id).catch(() => null),
    /**
     * §3.7, an article that names a child needs a consent record before it can
     * publish, and the panel that records it needs to know whose name it is.
     * Only articles carry the columns, so only articles are fetched.
     */
    type === 'article' ? getArticle(id).catch(() => null) : Promise.resolve(null),
  ]);

  const item = all.items.find((i) => i.id === id);
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/site"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Situs
      </Link>

      <PageHeader
        className="mt-4"
        title={item.title}
        subtitle={item.slug ? `/${item.slug} · versi ${item.version}` : `versi ${item.version}`}
      />

      <div className="mt-8 space-y-6">
        <ContentDetail item={item} versions={versions.items} />

        {article?.studentId ? (
          <ConsentPanel
            type={type}
            id={id}
            studentName={article.studentName}
            consentSource={article.consentSource}
            consentAt={article.consentAt}
          />
        ) : null}
        {/*
          Absent only when the API could not be reached, every content type has
          SEO overrides, and `getSeo` now answers with an all-null record rather
          than null when nothing has been set.
        */}
        {seo && (
          <SeoPanel
            type={type}
            id={id}
            seo={seo}
            contentTitle={item.title}
            siteUrl={env.NEXT_PUBLIC_SITE_URL ?? ''}
          />
        )}
      </div>
    </div>
  );
}
