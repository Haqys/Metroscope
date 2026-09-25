import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ApprovalDecision } from '@/components/internal/approval-decision';
import { ContentPreview, type ContentPreviewData } from '@/components/internal/content-preview';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Review & Approval Konten' };

/* Dummy submission until `GET /content/:id` is wired. */
const CONTENT: ContentPreviewData = {
  title: 'Juara 1 OSN Kota. Aditya Pratama',
  body: 'Selamat kepada Aditya Pratama yang berhasil meraih Juara 1 pada Olimpiade Sains Nasional tingkat Kota Jakarta Selatan tahun 2026. Pencapaian ini adalah hasil kerja keras dan bimbingan intensif bersama Kak Dinda.',
  author: 'Kak Rafi',
  authorRole: 'Editor',
  submittedAt: '8 Jul 2026',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Internal, content review & approval (wireframe: Input Form 6/7, Balqis). */
export default async function ContentReviewPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/content-approval"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Approval Konten
      </Link>

      <PageHeader
        className="mt-4"
        title={`Review Konten: ${CONTENT.title}`}
        subtitle="Preview konten + keputusan setujui / minta revisi."
        badge={
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Porto Siswa · Menunggu
          </span>
        }
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ContentPreview content={CONTENT} />
        </div>
        <div className="lg:col-span-5">
          <ApprovalDecision contentId={id} />
        </div>
      </div>
    </div>
  );
}
