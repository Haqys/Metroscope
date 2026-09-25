'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ArrowRight, CircleCheck, Lock, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CoverageRow, CoverageSummary } from '@/lib/api';
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  claimMinutesLeft,
  formatPeriod,
  urgencyLabel,
  urgencyTone,
} from '@/lib/assessment-display';

/**
 * The coverage queue (doc 03 FR-ASN-1, doc 13 §12.9).
 *
 * Real as of §3.5. This page filtered a four-row fixture against a hardcoded
 * `Set(['aditya-pratama', 'nabila-putri'])` and printed the resulting
 * percentage as if it meant something. Every number here is now counted over
 * `students` LEFT JOIN `assessments` for one period.
 *
 * **The list filters; the percentage does not.** FR-ASN-6 puts this exact
 * number in front of the Head on day 1, and a coverage figure that moves when
 * somebody types a name into a search box is not a number anybody can act on,
 * so the summary comes from the API's own unfiltered count, not from
 * `items.length`.
 */
const TABS = [
  { key: 'pending', label: 'Belum Dinilai' },
  { key: 'done', label: 'Selesai' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function CoverageQueue({
  rows,
  summary,
  period,
  canSubmit,
}: {
  rows: CoverageRow[];
  summary: CoverageSummary;
  period: string;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<TabKey>(summary.pending > 0 ? 'pending' : 'done');
  const [term, setTerm] = useState(params.get('q') ?? '');

  const shown = useMemo(() => {
    const byTab = rows.filter((r) =>
      tab === 'pending' ? r.status === 'PENDING' : r.status === 'DONE',
    );
    const needle = term.trim().toLowerCase();
    return needle ? byTab.filter((r) => r.studentName.toLowerCase().includes(needle)) : byTab;
  }, [rows, tab, term]);

  const setPeriod = (next: string) => {
    startTransition(() => router.push(`/assessments?period=${next}`));
  };

  return (
    <div>
      {/* ── the number the Head reads on day 1 ─────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <span className="text-sm font-medium text-neutral-900">
              Cakupan {formatPeriod(period)}
            </span>
            <p className="mt-0.5 text-xs text-neutral-400">
              {summary.done} dari {summary.total} siswa aktif sudah dinilai
            </p>
          </div>
          <span className="text-navy text-2xl font-bold">
            {summary.coveragePct === null ? '-' : `${summary.coveragePct}%`}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="bg-navy fx-bar-x h-full rounded-full"
            style={{ width: `${summary.coveragePct ?? 0}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="period" className="text-xs text-neutral-400">
            Periode
          </label>
          <input
            id="period"
            type="month"
            defaultValue={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
            className="focus:border-navy rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs focus:outline-none"
          />
        </div>
      </section>

      {/* ── the two tabs FR-ASN-1 names ────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-neutral-100 p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                tab === t.key ? 'text-navy bg-white shadow-sm' : 'hover:text-navy text-neutral-500',
              )}
            >
              {t.label} ({t.key === 'pending' ? summary.pending : summary.done})
            </button>
          ))}
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
              : tab === 'pending'
                ? 'Semua siswa aktif sudah dinilai bulan ini.'
                : 'Belum ada yang dinilai bulan ini.'}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200/70 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
            {shown.map((row) => (
              <li key={row.studentId}>
                <Link
                  href={`/assessments/${row.studentSlug}?period=${period}`}
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
                      {/**
                       * A live claim by somebody else. Shown rather than
                       * hidden: FR-ASN-2 calls it a soft lock, so the row stays
                       * clickable and the write is what refuses, the point is
                       * that a second mentor knows before they start typing.
                       */}
                      {row.claimedByName && row.claimExpiresAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
                          <Lock className="h-3 w-3" aria-hidden />
                          {row.claimedByName} · {claimMinutesLeft(row.claimExpiresAt)}m
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      {row.programNames || 'Belum terdaftar di program mana pun'}
                    </span>
                    {row.status === 'PENDING' ? (
                      <span
                        className={cn(
                          'mt-1 block text-xs font-medium',
                          urgencyTone(row.monthsSinceLastAssessment),
                        )}
                      >
                        {urgencyLabel(row.monthsSinceLastAssessment)}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-neutral-400">
                        Dinilai {row.assessorName ?? 'tim'}
                      </span>
                    )}
                  </span>

                  {row.status === 'DONE' && row.avgScore !== null && row.category ? (
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                          CATEGORY_TONE[row.category],
                        )}
                      >
                        {CATEGORY_LABEL[row.category]}
                      </span>
                      <span className="text-sm font-semibold text-neutral-900">
                        {row.avgScore.toFixed(1)}/10
                      </span>
                      <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                    </span>
                  ) : (
                    <span className="text-navy flex shrink-0 items-center gap-2 text-xs font-medium">
                      {canSubmit ? 'Nilai' : 'Lihat'}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
