import type { Metadata } from 'next';
import Link from 'next/link';

import { MediaBrowser } from '@/components/internal/media-browser';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { listMedia, type MediaQuery } from '@/lib/api';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';

const FILTERS: { label: string; query: MediaQuery }[] = [
  { label: 'Semua', query: {} },
  { label: 'Gambar', query: { kind: 'image' } },
  { label: 'Dokumen', query: { kind: 'pdf' } },
  { label: 'Perlu Alt Text', query: { missingAlt: true } },
  { label: 'Tempat Sampah', query: { deleted: true } },
];

interface PageProps {
  searchParams: Promise<{ filter?: string; q?: string }>;
}

/**
 * Media library (doc 13 §9.7).
 *
 * Content-type agnostic by design. Nothing here knows whether an asset will
 * end up on an article, a page or a programme. Built before any of them exist
 * precisely so none of them can bake in assumptions about it.
 */
export default async function MediaPage({ searchParams }: PageProps) {
  const { filter = 'Semua', q } = await searchParams;
  const active = FILTERS.find((f) => f.label === filter) ?? FILTERS[0]!;

  const { items } = await listMedia({ ...active.query, q, limit: 100 });

  const href = (label: string) => {
    const params = new URLSearchParams();
    if (label !== 'Semua') params.set('filter', label);
    if (q) params.set('q', q);
    return `/site/media${params.size ? `?${params}` : ''}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Media" subtitle="Gambar dan dokumen untuk seluruh konten situs." />

      <form className="mt-6" action="/site/media">
        {filter !== 'Semua' && <input type="hidden" name="filter" value={filter} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Cari judul, alt text, atau nama berkas…"
          className="focus:border-navy focus:ring-navy/20 w-full rounded-full border border-neutral-300 px-5 py-2.5 text-sm"
        />
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={href(f.label)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              f.label === active.label
                ? 'bg-navy text-white'
                : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        {items.length === 0 && active.label === 'Tempat Sampah' ? (
          <EmptyState
            title="Tempat sampah kosong"
            description="Media yang dihapus muncul di sini dan bisa dipulihkan."
          />
        ) : (
          <MediaBrowser items={items} showingBin={active.label === 'Tempat Sampah'} />
        )}
      </div>
    </div>
  );
}
