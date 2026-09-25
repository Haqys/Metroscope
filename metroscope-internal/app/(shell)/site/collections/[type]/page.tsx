import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { NewSurfaceButton } from '@/components/internal/new-surface-button';
import { SUBTITLE, TYPE_LABEL } from '@/lib/surface-fields';
import { listContent, type ContentStatus } from '@/lib/api';

export const metadata: Metadata = { title: 'Koleksi' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string }>;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draf', tone: 'bg-neutral-100 text-neutral-600' },
  IN_REVIEW: { label: 'Menunggu Review', tone: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Disetujui', tone: 'bg-sky-50 text-sky-700' },
  SCHEDULED: { label: 'Terjadwal', tone: 'bg-violet-50 text-violet-700' },
  PUBLISHED: { label: 'Terbit', tone: 'bg-emerald-50 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', tone: 'bg-neutral-100 text-neutral-400' },
};

/**
 * One list for FAQ entries, testimonials and mentor profiles.
 *
 * Reads `/site/content?type=…`, the cross-type queue every other CMS list uses.
 * A per-collection list endpoint would be the fourth, fifth and sixth copy of a
 * query that already answers the only question this page asks.
 */
export default async function CollectionPage({ params }: PageProps) {
  const { type } = await params;
  if (!TYPE_LABEL[type]) notFound();

  const { items } = await listContent({ type, limit: 100 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={TYPE_LABEL[type]!} subtitle={SUBTITLE[type]} />

      <div className="mt-6">
        {/**
         * A competition needs a deadline before the row means anything, so it
         * is created on `/competitions/new`, the operational form, and edited
         * here. One creation path, not two: the alternative was a second form
         * that makes a lomba with no date on it.
         */}
        {type === 'competition' ? (
          <Link
            href="/competitions/new"
            className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Lomba Baru
          </Link>
        ) : (
          <NewSurfaceButton type={type} />
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Belum ada isi" description="Tambahkan yang pertama." />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {items.map((item) => {
            const status = STATUS_LABEL[item.status as ContentStatus] ?? STATUS_LABEL.DRAFT!;
            return (
              <li key={item.id}>
                <Link
                  href={`/site/collections/${type}/${item.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">{item.title}</p>
                    <p className="truncate text-xs text-neutral-400">
                      {item.slug ? `/${item.slug} · ` : ''}
                      {item.version > 0 ? `versi ${item.version}` : 'belum pernah terbit'}
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
