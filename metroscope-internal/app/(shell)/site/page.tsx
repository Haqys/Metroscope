import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { ContentQueue } from '@/components/internal/content-queue';
import { listContent, type ContentStatus } from '@/lib/api';

export const metadata: Metadata = { title: 'Situs' };
export const dynamic = 'force-dynamic';

const TABS: { label: string; status?: ContentStatus }[] = [
  { label: 'Semua' },
  { label: 'Draf', status: 'DRAFT' },
  { label: 'Menunggu Review', status: 'IN_REVIEW' },
  { label: 'Disetujui', status: 'APPROVED' },
  { label: 'Terjadwal', status: 'SCHEDULED' },
  { label: 'Terbit', status: 'PUBLISHED' },
];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Situs, the CMS home (doc 13 §9.4).
 *
 * One queue across every content type rather than a page per type: the
 * question this page answers is "what is waiting on me?", and that question
 * does not care whether the answer is a programme or an article. The type is a
 * column, not a destination.
 */
export default async function SitePage({ searchParams }: PageProps) {
  const { tab = 'Semua' } = await searchParams;
  const active = TABS.find((t) => t.label === tab) ?? TABS[0]!;

  const [all, filtered] = await Promise.all([
    listContent({ limit: 100 }),
    active.status ? listContent({ status: active.status, limit: 100 }) : Promise.resolve(null),
  ]);

  const items = filtered?.items ?? all.items;
  const countOf = (s?: ContentStatus) =>
    s ? all.items.filter((i) => i.status === s).length : all.items.length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Situs"
        subtitle="Draf, review, jadwal terbit, dan riwayat versi untuk semua jenis konten."
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.label}
            href={t.label === 'Semua' ? '/site' : `/site?tab=${encodeURIComponent(t.label)}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              t.label === active.label
                ? 'bg-navy text-white'
                : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            {t.label}
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                t.label === active.label
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-200/70 text-neutral-600'
              }`}
            >
              {countOf(t.status)}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            title="Tidak ada konten di tahap ini"
            description="Konten baru muncul di sini begitu dibuat atau dikirim untuk direview."
          />
        ) : (
          <ContentQueue items={items} />
        )}
      </div>
    </div>
  );
}
