'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Search, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ProgressBoardRow, ProgressStatus, ProgressSummary } from '@/lib/api';
import { STATUS_LABEL, STATUS_TONE, lastTouchedLabel, percentTone } from '@/lib/progress-display';

/**
 * The staleness board (doc 03 FR-UPD-1, doc 13 §7.2).
 *
 * Real as of §3.6. This page carried a four-name `STALE_DAYS` map, `{'aditya-
 * pratama': 3, 'keisha-amara': 16, …}`, hand-typed beside a fixture, sorted by
 * itself, and it would have gone on saying "16 hari lalu" forever.
 *
 * **No date arithmetic here.** `daysSinceUpdate` and `status` arrive from
 * `app.days_since_wita()` and `app.progress_status()`; the threshold arrives as
 * `staleAfterDays`. The component states the rule it was given and does not own
 * one, which is why the banner can name the number without hardcoding it.
 */
const TABS: { key: 'all' | ProgressStatus; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'NEVER', label: 'Belum Pernah' },
  { key: 'STALE', label: 'Perlu Diperbarui' },
  { key: 'CURRENT', label: 'Terkini' },
];

export function ProgressBoard({
  rows,
  summary,
  staleAfterDays,
  canEdit,
}: {
  rows: ProgressBoardRow[];
  summary: ProgressSummary;
  staleAfterDays: number;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<'all' | ProgressStatus>('all');
  const [term, setTerm] = useState('');

  const shown = useMemo(() => {
    const byTab = tab === 'all' ? rows : rows.filter((r) => r.status === tab);
    const needle = term.trim().toLowerCase();
    return needle ? byTab.filter((r) => r.studentName.toLowerCase().includes(needle)) : byTab;
  }, [rows, tab, term]);

  const needsAttention = summary.never + summary.stale;

  return (
    <div>
      {/**
       * The banner counts the whole ACTIVE roll, never the filtered list,
       * the §3.5 lesson. A number that shrank because somebody typed into a
       * search box would be worse than no number.
       */}
      {needsAttention > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm text-amber-900">
            <strong>{needsAttention} siswa</strong> perlu perhatian,{' '}
            {summary.never > 0 ? `${summary.never} belum pernah dicatat` : null}
            {summary.never > 0 && summary.stale > 0 ? ', ' : null}
            {summary.stale > 0
              ? `${summary.stale} tidak diperbarui lebih dari ${staleAfterDays} hari`
              : null}
            .
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          Semua {summary.total} siswa aktif punya progress yang terkini.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-neutral-100 p-1" role="tablist">
          {TABS.map((t) => {
            const count =
              t.key === 'all'
                ? summary.total
                : t.key === 'NEVER'
                  ? summary.never
                  : t.key === 'STALE'
                    ? summary.stale
                    : summary.current;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'text-navy bg-white shadow-sm'
                    : 'hover:text-navy text-neutral-500',
                )}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-300" aria-hidden />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari siswa…"
            aria-label="Cari siswa"
            className="focus:border-navy rounded-full border border-neutral-200 py-2 pr-4 pl-9 text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4">
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 px-6 py-10 text-center text-sm text-neutral-400">
            {term.trim()
              ? `Tidak ada siswa yang cocok dengan “${term.trim()}”.`
              : summary.total === 0
                ? 'Belum ada siswa aktif.'
                : 'Tidak ada siswa di kategori ini.'}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200/70 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
            {shown.map((row) => (
              <li key={row.studentId}>
                <Link
                  href={`/progress/${row.studentSlug}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-neutral-900">
                        {row.studentName}
                      </span>
                      {row.level ? (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                          {row.level}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      {row.programNames || 'Belum terdaftar di program mana pun'}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      {lastTouchedLabel(row.status, row.daysSinceUpdate)}
                      {row.lastUpdatedBy ? ` · oleh ${row.lastUpdatedBy}` : ''}
                      {row.topicsAvailable > 0
                        ? ` · ${row.topicsTracked}/${row.topicsAvailable} topik`
                        : ' · program ini belum punya topik'}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-3">
                    {row.overallPercent !== null ? (
                      <span className="hidden items-center gap-2 sm:flex">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                          <span
                            className={cn(
                              'block h-full rounded-full bg-gradient-to-r',
                              percentTone(row.overallPercent),
                            )}
                            style={{ width: `${row.overallPercent}%` }}
                          />
                        </span>
                        <span className="w-9 text-right text-sm font-semibold text-neutral-900">
                          {row.overallPercent}%
                        </span>
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                        STATUS_TONE[row.status],
                      )}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                    <ArrowRight className="h-4 w-4 text-neutral-400" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!canEdit ? (
        <p className="mt-6 rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 ring-1 ring-neutral-200 ring-inset">
          Kamu bisa membaca papan ini, tapi hanya mentor yang boleh memperbarui progress.
        </p>
      ) : null}
    </div>
  );
}
