import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { NewPageButton } from '@/components/internal/new-page-button';
import { listContent } from '@/lib/api';

export const metadata: Metadata = { title: 'Halaman' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draf', tone: 'bg-neutral-100 text-neutral-600' },
  IN_REVIEW: { label: 'Menunggu Review', tone: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Disetujui', tone: 'bg-sky-50 text-sky-700' },
  SCHEDULED: { label: 'Terjadwal', tone: 'bg-violet-50 text-violet-700' },
  PUBLISHED: { label: 'Terbit', tone: 'bg-emerald-50 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', tone: 'bg-neutral-100 text-neutral-400' },
};

/**
 * Halaman, marketing pages composed of blocks (doc 13 §9.4).
 *
 * Reads `/site/content?type=page`, the same cross-type queue the CMS home, the
 * article list and the programme list use. No per-type list endpoint.
 */
export default async function SitePagesPage() {
  const { items } = await listContent({ type: 'page', limit: 100 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Halaman"
        subtitle="Halaman pemasaran yang disusun dari blok. Terbit lewat alur yang sama dengan artikel."
      />

      <div className="mt-6">
        <NewPageButton />
      </div>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Belum ada halaman" description="Buat halaman pertama." />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {items.map((p) => {
            const status = STATUS_LABEL[p.status] ?? STATUS_LABEL.DRAFT!;
            return (
              <li key={p.id}>
                <Link
                  href={`/site/pages/${p.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900">{p.title}</p>
                    <p className="truncate text-xs text-neutral-400">
                      /{p.slug} · {p.version > 0 ? `versi ${p.version}` : 'belum pernah terbit'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
