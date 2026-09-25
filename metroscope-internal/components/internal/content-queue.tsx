import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';

import type { ContentItem, ContentStatus } from '@/lib/api';

export const STATUS_LABEL: Record<ContentStatus, string> = {
  DRAFT: 'Draf',
  IN_REVIEW: 'Menunggu review',
  APPROVED: 'Disetujui',
  SCHEDULED: 'Terjadwal',
  PUBLISHED: 'Terbit',
  ARCHIVED: 'Diarsipkan',
};

export const STATUS_TONE: Record<ContentStatus, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-600',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-sky-100 text-sky-700',
  SCHEDULED: 'bg-violet-100 text-violet-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-neutral-200 text-neutral-500',
};

const TYPE_LABEL: Record<string, string> = { program: 'Program' };

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** One row per piece of content, whatever type produced it. */
export function ContentQueue({ items }: { items: ContentItem[] }) {
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
      {items.map((item) => (
        <li key={`${item.type}:${item.id}`}>
          <Link
            href={`/site/${item.type}/${item.id}`}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-neutral-900">
                  {item.title}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                  {TYPE_LABEL[item.type] ?? item.type}
                </span>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                {item.slug && <span className="font-mono">/{item.slug}</span>}
                <span>v{item.version}</span>
                {item.publishAt && (
                  <span className="text-violet-600">
                    <CalendarClock className="mr-1 inline h-3 w-3" aria-hidden />
                    {formatWhen(item.publishAt)}
                  </span>
                )}
                {item.status === 'IN_REVIEW' && item.reviewNote && (
                  <span className="text-amber-700">“{item.reviewNote}”</span>
                )}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
