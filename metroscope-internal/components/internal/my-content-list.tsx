'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ContentStatus, ContentType } from '@/lib/types';
import { Clock3, Eye, FileText, Pencil, RotateCcw } from 'lucide-react';

import { SegmentedTabs } from '@/components/portal/segmented-tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface MyContentItem {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  submittedAt: string;
  body: string;
  /** Head's note when the item came back for revision. */
  revisionNote?: string;
  featuredStudent?: string;
}

const TYPE_LABEL: Record<ContentType, string> = {
  ARTICLE: 'Artikel',
  PORTFOLIO: 'Porto Siswa',
  IG_STORY: 'Konten IG',
  ANNOUNCEMENT: 'Pengumuman',
  TESTIMONIAL: 'Testimoni',
};

const TYPE_STYLE: Record<ContentType, string> = {
  ARTICLE: 'bg-violet-50 text-violet-700 ring-violet-200/70',
  PORTFOLIO: 'bg-navy-light text-navy ring-navy/15',
  IG_STORY: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  ANNOUNCEMENT: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  TESTIMONIAL: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
};

const STATUS_META: Record<ContentStatus, { label: string; chip: string; rail: string }> = {
  PENDING: {
    label: 'Menunggu Review',
    chip: 'bg-amber-100 text-amber-700',
    rail: 'bg-amber-400',
  },
  APPROVED: {
    label: 'Disetujui · Tayang',
    chip: 'bg-emerald-100 text-emerald-700',
    rail: 'bg-emerald-500',
  },
  NEEDS_REVISION: {
    label: 'Perlu Revisi',
    chip: 'bg-maroon-light text-maroon',
    rail: 'bg-maroon',
  },
};

const FILTERS = ['Semua', 'Perlu Revisi', 'Menunggu Review', 'Disetujui'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_STATUS: Record<Exclude<Filter, 'Semua'>, ContentStatus> = {
  'Perlu Revisi': 'NEEDS_REVISION',
  'Menunggu Review': 'PENDING',
  Disetujui: 'APPROVED',
};

/**
 * The author's own content and where each piece stands in approval
 * (doc 12 §6). Revision notes surface here so the Editor knows what to fix.
 *
 * TODO: wire to `GET /content?author=me`.
 */
export function MyContentList({ items }: { items: MyContentItem[] }) {
  const [filter, setFilter] = useState<Filter>('Semua');
  const [preview, setPreview] = useState<MyContentItem | null>(null);

  const visible =
    filter === 'Semua' ? items : items.filter((i) => i.status === FILTER_STATUS[filter]);
  const needsWork = items.filter((i) => i.status === 'NEEDS_REVISION').length;

  return (
    <div>
      <SegmentedTabs
        tabs={FILTERS}
        value={filter}
        onChange={setFilter}
        label="Filter konten saya"
        aside={
          <p className="text-xs text-neutral-400">
            {items.length} konten
            {needsWork > 0 && (
              <>
                {' '}
                · <strong className="text-maroon font-semibold">{needsWork} perlu revisi</strong>
              </>
            )}
          </p>
        }
      />

      {/* Revision callout, the thing an Editor most needs to see */}
      {needsWork > 0 && filter === 'Semua' && (
        <div className="border-maroon/20 bg-maroon-light/40 mt-5 flex items-start gap-3 rounded-2xl border p-4">
          <RotateCcw className="text-maroon mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-maroon text-sm">
            Ada {needsWork} konten yang dikembalikan Balqis. Buka detailnya untuk membaca catatan
            revisi.
          </p>
        </div>
      )}

      <div className="fx-stagger mt-5 space-y-2.5">
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-400">
            Belum ada konten di kategori ini.
          </p>
        ) : (
          visible.map((item) => {
            const meta = STATUS_META[item.status];
            return (
              <article
                key={item.id}
                className="fx-hover relative flex flex-wrap items-center gap-4 rounded-2xl border border-neutral-200/70 bg-white p-4 pl-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
              >
                <span
                  className={cn('absolute inset-y-3 left-0 w-1 rounded-full', meta.rail)}
                  aria-hidden
                />

                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                  <FileText className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{item.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                        TYPE_STYLE[item.type],
                      )}
                    >
                      {TYPE_LABEL[item.type]}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                      <Clock3 className="h-3 w-3" />
                      {item.submittedAt}
                    </span>
                  </div>
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap',
                    meta.chip,
                  )}
                >
                  {meta.label}
                </span>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreview(item)}
                    className="hover:border-navy/40 hover:text-navy flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Lihat
                  </button>
                  {item.status === 'NEEDS_REVISION' && (
                    <Link
                      href="/content/new"
                      className="bg-maroon hover:bg-maroon-dark flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Revisi
                    </Link>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Preview + revision note */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-xl">
          {preview && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                      TYPE_STYLE[preview.type],
                    )}
                  >
                    {TYPE_LABEL[preview.type]}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-3 py-0.5 text-xs font-semibold',
                      STATUS_META[preview.status].chip,
                    )}
                  >
                    {STATUS_META[preview.status].label}
                  </span>
                </div>
                <DialogTitle>{preview.title}</DialogTitle>
              </DialogHeader>

              {preview.revisionNote && (
                <div className="border-maroon/20 bg-maroon-light/40 rounded-xl border p-4">
                  <p className="text-maroon text-[10px] font-semibold tracking-[0.15em] uppercase">
                    Catatan Revisi dari Balqis
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">
                    {preview.revisionNote}
                  </p>
                </div>
              )}

              <p className="rounded-xl bg-neutral-50 p-4 text-sm leading-relaxed whitespace-pre-line text-neutral-700 ring-1 ring-neutral-100">
                {preview.body}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
                <span>Diajukan {preview.submittedAt}</span>
                {preview.featuredStudent && <span>Menampilkan: {preview.featuredStudent}</span>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
