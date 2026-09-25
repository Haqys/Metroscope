import type { Metadata } from 'next';

import { ApprovalQueue, type ContentItem } from '@/components/internal/approval-queue';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Approval & Konten Manager' };

/* ---------------------------------------------------------------------------
   Dummy approval queue mirroring the wireframe (Ringkasan 7/7) until the
   content module is wired (`GET /content`).
--------------------------------------------------------------------------- */
const CONTENT: ContentItem[] = [
  {
    id: 'c1',
    title: 'Juara 1 OSN Kota. Aditya P.',
    type: 'PORTFOLIO',
    author: 'Kak Rafi',
    submittedAt: '2 jam lalu',
    status: 'PENDING',
  },
  {
    id: 'c2',
    title: 'Pengumuman Libur Lebaran',
    type: 'ANNOUNCEMENT',
    author: 'Kak Sarah',
    submittedAt: '5 jam lalu',
    status: 'PENDING',
  },
  {
    id: 'c3',
    title: 'Story Trial Class Juli',
    type: 'IG_STORY',
    author: 'Kak Rafi',
    submittedAt: 'Kemarin',
    status: 'PENDING',
  },
  {
    id: 'c4',
    title: 'Artikel: Tips Hadapi OSK',
    type: 'ARTICLE',
    author: 'Kak Rafi',
    submittedAt: '2 hari lalu',
    status: 'PENDING',
  },
  {
    id: 'c5',
    title: 'Assessment Bulanan. Bagas N.',
    type: 'TESTIMONIAL',
    author: 'Kak Dinda',
    submittedAt: '3 hari lalu',
    status: 'APPROVED',
  },
  {
    id: 'c6',
    title: 'Porto Finalis OSP. Bagas',
    type: 'PORTFOLIO',
    author: 'Kak Dinda',
    submittedAt: '4 hari lalu',
    status: 'APPROVED',
  },
  {
    id: 'c7',
    title: 'Story Trial Class Juni',
    type: 'IG_STORY',
    author: 'Kak Rafi',
    submittedAt: '1 minggu lalu',
    status: 'NEEDS_REVISION',
  },
];

/** Internal. Content Approval Manager (wireframe: Ringkasan 7/7). */
export default function ContentApprovalPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Approval & Konten Manager"
        subtitle="Semua konten dari Editor melewati approval Balqis sebelum tayang ke web."
      />

      <div className="mt-8">
        <ApprovalQueue items={CONTENT} />
      </div>
    </div>
  );
}
