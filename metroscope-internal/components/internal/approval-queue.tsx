'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ContentStatus, ContentType } from '@/lib/types';
import { Check, Clock3, FileText, RotateCcw } from 'lucide-react';

import { SegmentedTabs } from '@/components/portal/segmented-tabs';
import { cn } from '@/lib/utils';

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  author: string;
  submittedAt: string;
  status: ContentStatus;
}

const TYPE_LABEL: Record<ContentType, string> = {
  ARTICLE: 'Artikel',
  PORTFOLIO: 'Porto Siswa',
  IG_STORY: 'Konten IG',
  ANNOUNCEMENT: 'Pengumuman',
  TESTIMONIAL: 'Assessment',
};

const TYPE_STYLE: Record<ContentType, string> = {
  ARTICLE: 'bg-violet-50 text-violet-700 ring-violet-200/70',
  PORTFOLIO: 'bg-navy-light text-navy ring-navy/15',
  IG_STORY: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  ANNOUNCEMENT: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  TESTIMONIAL: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
};

const COLUMNS: {
  status: ContentStatus;
  label: string;
  chip: string;
  rail: string;
  icon: typeof Clock3;
}[] = [
  {
    status: 'PENDING',
    label: 'Menunggu Review',
    chip: 'bg-amber-100 text-amber-700',
    rail: 'bg-amber-400',
    icon: Clock3,
  },
  {
    status: 'APPROVED',
    label: 'Disetujui · Siap Tayang',
    chip: 'bg-emerald-100 text-emerald-700',
    rail: 'bg-emerald-500',
    icon: Check,
  },
  {
    status: 'NEEDS_REVISION',
    label: 'Perlu Revisi',
    chip: 'bg-maroon-light text-maroon',
    rail: 'bg-maroon',
    icon: RotateCcw,
  },
];

const FILTERS = ['Semua', 'Menunggu', 'Disetujui', 'Revisi'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_STATUS: Record<Exclude<Filter, 'Semua'>, ContentStatus> = {
  Menunggu: 'PENDING',
  Disetujui: 'APPROVED',
  Revisi: 'NEEDS_REVISION',
};

/**
 * Content approval board (wireframe: Ringkasan 7/7). All Editor submissions
 * pass through Balqis before going live.
 * TODO: wire to `GET /content?status=` + `PATCH /content/:id` (content module).
 */
export function ApprovalQueue({ items }: { items: ContentItem[] }) {
  const [filter, setFilter] = useState<Filter>('Semua');

  const visible = useMemo(
    () =>
      filter === 'Semua' ? COLUMNS : COLUMNS.filter((c) => c.status === FILTER_STATUS[filter]),
    [filter],
  );

  const countOf = (s: ContentStatus) => items.filter((i) => i.status === s).length;

  return (
    <div>
      <SegmentedTabs
        tabs={FILTERS}
        value={filter}
        onChange={setFilter}
        label="Filter status konten"
        aside={
          <p className="text-xs text-neutral-400">
            {countOf('PENDING')} menunggu review · {countOf('APPROVED')} siap tayang
          </p>
        }
      />

      <div className={cn('mt-6 grid gap-4', visible.length === 1 ? 'max-w-md' : 'md:grid-cols-3')}>
        {visible.map((col) => {
          const colItems = items.filter((i) => i.status === col.status);
          return (
            <section
              key={col.status}
              aria-label={col.label}
              className="flex min-h-[16rem] flex-col rounded-2xl border border-neutral-200/70 bg-neutral-100/60 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    col.chip,
                  )}
                >
                  <col.icon className="h-3.5 w-3.5" />
                  {col.label}
                </span>
                <span className="text-xs font-semibold text-neutral-400">{colItems.length}</span>
              </div>

              <div className="fx-stagger flex flex-1 flex-col gap-2.5">
                {colItems.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-neutral-300/80 px-4 py-8 text-center text-xs text-neutral-400">
                    Tidak ada konten
                  </p>
                ) : (
                  colItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/content-approval/review/${item.id}`}
                      className="fx-hover relative block rounded-xl border border-neutral-200/80 bg-white p-3.5 pl-4"
                    >
                      <span
                        className={cn('absolute inset-y-2 left-0 w-1 rounded-full', col.rail)}
                        aria-hidden
                      />
                      <p className="text-sm leading-snug font-semibold text-neutral-900">
                        {item.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                            TYPE_STYLE[item.type],
                          )}
                        >
                          {TYPE_LABEL[item.type]}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
                        <span className="flex items-center gap-1.5 truncate text-xs text-neutral-400">
                          <FileText className="h-3 w-3 shrink-0" />
                          {item.author}
                        </span>
                        <span className="shrink-0 text-xs text-neutral-400">
                          {item.submittedAt}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
