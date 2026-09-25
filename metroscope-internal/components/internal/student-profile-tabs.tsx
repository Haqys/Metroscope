'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Award, CalendarClock, NotebookPen, ReceiptText } from 'lucide-react';

import { SegmentedTabs } from '@/components/portal/segmented-tabs';
import { cn } from '@/lib/utils';
import type { AssessmentRecord, CompetitionRow, ProgressTopic, SessionRow } from '@/lib/api';
import { CATEGORY_LABEL, formatPeriod } from '@/lib/assessment-display';
import { RESULT_LABEL } from '@/lib/competition-display';
import { formatIdr, percentTone } from '@/lib/progress-display';
import { sessionRange } from '@/lib/session-display';

/**
 * Billing is a tab a MENTOR never sees.
 *
 * doc 13 §8.3 gives them no finance page, so the mentor app has no invoice
 * client at all, and a null invoices prop removes the tab rather than showing an
 * empty one, because 'this family has no bills' and 'you may not read their
 * bills' are different statements and only one of them is true.
 */
export interface ProfileInvoice {
  id: string;
  number: string;
  period: string;
  amount: number;
  status: string;
}

const ALL_TABS = ['Progress & Porto', 'Jadwal', 'Pembayaran', 'Catatan Mentor'] as const;
type Tab = (typeof ALL_TABS)[number];

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-400">
      {children}
    </p>
  );
}

/**
 * The 360° detail (wireframe: Ringkasan 4/7), real as of §3.6.
 *
 * Every tab was a fixture array, four sessions, three invoices, two mentor
 * notes, three achievements, all about a boy called Aditya and all shown for
 * whichever student you opened. Each is now the record it claimed to be, and
 * each comes from the module that owns it rather than from a copy: sessions
 * from §3.1, invoices from Phase 1, achievements from §3.4's competition
 * targets, notes from §3.5's assessments, topics from §3.6's progress.
 *
 * Nothing here is a new endpoint. A profile is a composition of records that
 * already exist, and giving it its own would have been giving each of those
 * facts a second home.
 */
export function StudentProfileTabs({
  topics,
  sessions,
  invoices,
  assessments,
  competitions,
}: {
  topics: ProgressTopic[];
  sessions: SessionRow[];
  invoices: ProfileInvoice[] | null;
  assessments: AssessmentRecord[];
  competitions: CompetitionRow[];
}) {
  const [tab, setTab] = useState<Tab>('Progress & Porto');
  const TABS = ALL_TABS.filter(
    (t) => t !== 'Pembayaran' || invoices !== null,
  ) as unknown as readonly Tab[];

  const recorded = topics.filter((t) => t.percent !== null);
  const wins = competitions.filter((c) => c.myResult && c.myResult !== 'PENDING');

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Detail siswa" />

      <div className="mt-6">
        {tab === 'Progress & Porto' && (
          <div className="fx-rise">
            {recorded.length === 0 ? (
              <Empty>Belum ada progress yang dicatat.</Empty>
            ) : (
              <div className="space-y-5">
                {recorded.map((t) => (
                  <div key={t.topicId}>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-medium text-neutral-800">{t.topicName}</p>
                      <p className="text-navy text-sm font-semibold">{t.percent}%</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r',
                          percentTone(t.percent!),
                        )}
                        style={{ width: `${t.percent}%` }}
                        role="progressbar"
                        aria-label={t.topicName}
                        aria-valuenow={t.percent!}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8">
              <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-900">
                <Award className="h-4 w-4 text-amber-500" />
                Riwayat Prestasi
              </h3>
              <div className="mt-4">
                {wins.length === 0 ? (
                  <Empty>Belum ada hasil lomba yang tercatat.</Empty>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {wins.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-neutral-800">
                            {c.name}
                          </span>
                          <span className="text-xs text-neutral-400">{c.organizer ?? '-'}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {c.myAward ?? RESULT_LABEL[c.myResult!]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'Jadwal' && (
          <div className="fx-rise">
            {sessions.length === 0 ? (
              <Empty>Belum ada sesi terjadwal.</Empty>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
                        <CalendarClock className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                        {sessionRange(s)}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        {s.mentorName ?? 'Mentor belum ditentukan'}
                        {s.programName ? ` · ${s.programName}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {s.attendanceStatus ?? s.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'Pembayaran' && invoices !== null && (
          <div className="fx-rise">
            {invoices.length === 0 ? (
              <Empty>Belum ada tagihan.</Empty>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
                        <ReceiptText className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                        {i.number}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-400">{i.period}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-neutral-900">
                        {formatIdr(i.amount)}
                      </span>
                      <span className="text-xs text-neutral-500">{i.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'Catatan Mentor' && (
          <div className="fx-rise">
            {assessments.filter((a) => a.note).length === 0 ? (
              <Empty>
                Belum ada catatan mentor. Catatan ditulis saat assessment bulanan,{' '}
                <Link href="/assessments" className="text-navy font-medium">
                  buka antrean assessment
                </Link>
                .
              </Empty>
            ) : (
              <ul className="space-y-4">
                {assessments
                  .filter((a) => a.note)
                  .map((a) => (
                    <li key={a.id} className="rounded-xl bg-neutral-50 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                        <NotebookPen className="h-3.5 w-3.5" aria-hidden />
                        {formatPeriod(a.period)} · {a.assessorName ?? 'Tim Metroscope'} ·{' '}
                        {a.avgScore.toFixed(1)}/10 {CATEGORY_LABEL[a.category]}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{a.note}</p>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
