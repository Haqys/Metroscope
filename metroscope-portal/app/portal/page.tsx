import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, ChartLine, ClipboardCheck, Medal, Trophy, Wallet } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { StarRating } from '@/components/portal/star-rating';
import { SummaryCards, type SummaryStat } from '@/components/portal/summary-cards';
import { WeekScheduleTable } from '@/components/portal/week-schedule-table';
import {
  getAchievements,
  getStudentAssessments,
  getStudentProgress,
  listCompetitions,
  listInvoices,
  listSessions,
  listStudents,
  type Invoice,
} from '@/lib/api';
import { INVOICE_STATUS_LABEL, PAYABLE, formatDateId } from '@/lib/billing-display';
import { CATEGORY_LABEL } from '@/lib/assessment-display';
import { STATUS_LABEL, sessionDate, sessionRange } from '@/lib/session-display';

export const metadata: Metadata = { title: 'Ringkasan' };

/**
 * Portal, Ringkasan (wireframe 3/8).
 *
 * Real as of this task. What it held: `STUDENT = { name: 'Aditya Pratama' }`
 * and four more fixture constants, so a family signing in read somebody else's
 * next lesson, somebody else's 68% progress and somebody else's unpaid bill.
 * The screenshot that reported this bug showed the name of a child who has
 * never existed above the account of one who does.
 *
 * Composed from the endpoints that already exist, one call per module, rather
 * than a new `/me/summary` that would re-derive readiness, staleness and
 * payment state in a second place. doc 04 §5 is explicit that business logic
 * lives once, in the API, and a summary is by definition somebody else's
 * numbers gathered up. They are fetched in parallel; RLS scopes every one of
 * them to this family.
 *
 * `force-dynamic`: every figure here is per-account.
 */
export const dynamic = 'force-dynamic';

/** A bill that still wants money, worst first, so the card names the real one. */
function outstanding(invoices: Invoice[]): Invoice | null {
  const due = invoices.filter((i) => PAYABLE.includes(i.status));
  if (due.length === 0) return null;
  const overdue = due.filter((i) => i.status === 'OVERDUE');
  const pool = overdue.length > 0 ? overdue : due;
  return [...pool].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}

export default async function PortalSummaryPage() {
  const { items: students } = await listStudents();
  const child = students[0] ?? null;

  /**
   * A staff account, or a family whose child is not on the roll yet. The portal
   * shell admits anyone signed in on purpose (app/portal/layout.tsx), so this
   * is a normal state and gets a sentence rather than a crash.
   */
  if (!child) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Ringkasan" subtitle="Portal siswa Metroscope." />
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
          <p className="text-sm font-semibold text-neutral-900">Belum ada data siswa</p>
          <p className="mt-1 text-sm text-neutral-500">
            Akun ini belum terhubung dengan siswa mana pun, jadi tidak ada jadwal, tagihan, atau
            progress untuk ditampilkan.
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [sessions, invoices, progress, competitions, assessments, achievements] = await Promise.all(
    [
      listSessions({ from: now.toISOString(), to: weekAhead.toISOString() }).catch(() => ({
        items: [],
      })),
      listInvoices({ limit: 50 }).catch(() => ({ items: [], nextCursor: null })),
      getStudentProgress(child.id).catch(() => null),
      listCompetitions({ studentId: child.id }).catch(() => ({ items: [] })),
      getStudentAssessments(child.id).catch(() => null),
      getAchievements().catch(() => null),
    ],
  );

  const upcoming = [...sessions.items]
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'RESCHEDULED')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const nextSession = upcoming[0] ?? null;

  const bill = outstanding(invoices.items);
  const entered = competitions.items.filter((c) => c.myTargetId !== null);
  const overall = progress?.state?.overallPercent ?? null;

  /** The most recent assessment on record, whatever period it belongs to. */
  const latestAssessment = assessments?.current ?? assessments?.previous ?? null;

  const stats: SummaryStat[] = [
    {
      label: 'Les Berikutnya',
      value: nextSession ? sessionDate(nextSession.startsAt) : 'Belum ada',
      caption: nextSession
        ? `${sessionRange(nextSession)} · ${nextSession.mentorName ?? 'Mentor menyusul'}`
        : 'Jadwal akan muncul setelah tim menjadwalkan',
      icon: CalendarClock,
      tint: 'bg-navy-light text-navy',
      href: '/portal/schedule',
    },
    {
      label: 'Progress Modul',
      value: overall === null ? 'Belum ada' : `${overall}%`,
      caption:
        overall === null
          ? 'menunggu catatan pertama dari mentor'
          : `rata-rata ${progress?.topics.filter((t) => t.percent !== null).length ?? 0} topik`,
      icon: ChartLine,
      tint: 'bg-violet-50 text-violet-600',
      href: '/portal/progress',
      ...(overall === null ? {} : { progress: overall }),
    },
    {
      label: 'Lomba Diikuti',
      value: `${entered.length} kali`,
      caption: entered.length > 0 ? 'Riwayat & jadwal lomba' : 'Jelajahi katalog lomba',
      icon: Trophy,
      tint: 'bg-emerald-50 text-emerald-600',
      href: '/portal/competitions',
    },
    {
      label: 'Status Bayar',
      value: bill ? INVOICE_STATUS_LABEL[bill.status] : 'Aman',
      caption: bill
        ? `${bill.number} · jatuh tempo ${formatDateId(bill.dueDate)}`
        : invoices.items.length === 0
          ? 'Belum ada tagihan'
          : 'Semua tagihan lunas',
      icon: Wallet,
      tint: bill ? 'bg-maroon-light text-maroon' : 'bg-emerald-50 text-emerald-600',
      ...(bill ? { tone: 'warning' as const } : {}),
      href: '/portal/billing',
    },
  ];

  const weekRows = upcoming.slice(0, 5).map((s) => ({
    day: sessionDate(s.startsAt),
    time: sessionRange(s),
    mentor: s.mentorName ?? 'Menyusul',
    status: STATUS_LABEL[s.status],
  }));

  const ctaClass =
    'mt-auto block rounded-full border border-navy py-2.5 text-center text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-white';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Ringkasan ${child.name}`}
        subtitle={
          progress?.student.programNames
            ? `Program: ${progress.student.programNames}`
            : 'Program belum tercatat. Hubungi tim Metroscope untuk melengkapinya.'
        }
      />

      <div className="mt-8">
        <SummaryCards stats={stats} />
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Jadwal Les Minggu Ini"
          action={
            <Link
              href="/portal/schedule"
              className="text-navy hover:text-navy-dark text-sm font-medium transition-colors"
            >
              Lihat semua →
            </Link>
          }
        />
        <div className="mt-4">
          <WeekScheduleTable rows={weekRows} />
        </div>
      </section>

      <section className="fx-stagger mt-10 grid items-stretch gap-4 lg:grid-cols-3">
        {/* Progress */}
        <div className="fx-hover flex h-full flex-col rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
          <div className="flex items-center gap-2.5">
            <span className="bg-navy-light text-navy flex h-9 w-9 items-center justify-center rounded-xl">
              <ChartLine className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold tracking-tight text-neutral-900">
              Progress &amp; Porto
            </h3>
          </div>

          {overall === null ? (
            <p className="mt-5 flex-1 text-sm leading-relaxed text-neutral-500">
              Mentor belum mencatat progress per topik. Angkanya muncul di sini begitu topik pertama
              diperbarui.
            </p>
          ) : (
            <>
              <div className="mt-5 flex items-end justify-between gap-3">
                <p className="text-3xl font-bold tracking-tight text-neutral-900">
                  {overall}
                  <span className="text-xl text-neutral-400">%</span>
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="fx-bar-x from-navy to-navy/70 h-full rounded-full bg-gradient-to-r"
                  style={{ width: `${overall}%` }}
                  role="progressbar"
                  aria-valuenow={overall}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="mt-2 flex-1 text-xs text-neutral-500">
                rata-rata {progress?.topics.filter((t) => t.percent !== null).length ?? 0} topik
                yang sudah dicatat
              </p>
            </>
          )}

          <Link href="/portal/progress" className={ctaClass}>
            Lihat Progress
          </Link>
        </div>

        {/* Latest assessment */}
        <div className="fx-hover flex h-full flex-col rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold tracking-tight text-neutral-900">
              Assessment Terbaru
            </h3>
          </div>

          {latestAssessment ? (
            <>
              <div className="mt-5 flex items-baseline gap-2">
                <p className="text-4xl font-bold tracking-tight text-neutral-900">
                  {latestAssessment.avgScore.toFixed(1)}
                  <span className="text-xl font-medium text-neutral-400">/10</span>
                </p>
                <span className="bg-navy-light text-navy rounded-full px-3 py-1 text-xs font-semibold">
                  {CATEGORY_LABEL[latestAssessment.category]}
                </span>
              </div>
              <div className="mt-2.5">
                <StarRating value={latestAssessment.avgScore} size="h-4 w-4" />
              </div>
              <p className="mt-2.5 flex-1 text-xs text-neutral-500">
                {latestAssessment.period}
                {latestAssessment.assessorName ? ` · ${latestAssessment.assessorName}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-5 flex-1 text-sm leading-relaxed text-neutral-500">
              Belum ada assessment. Mentor menilai setiap bulan, dan hasilnya muncul di sini.
            </p>
          )}

          <Link href="/portal/assessments" className={ctaClass}>
            Lihat Detail
          </Link>
        </div>

        {/* Points and standing */}
        <div className="fx-hover from-navy-dark shadow-navy/20 flex h-full flex-col rounded-2xl bg-gradient-to-br to-[#0b1730] p-6 text-white shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400">
              <Medal className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold tracking-tight">Poin &amp; Peringkat</h3>
          </div>

          <div className="mt-5 flex items-end justify-between gap-3">
            <p className="text-3xl font-bold tracking-tight text-amber-300">
              {achievements?.student?.points ?? 0}
              <span className="text-lg font-medium text-white/50"> poin</span>
            </p>
            {achievements?.rank ? (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">
                #{achievements.rank} dari {achievements.total}
              </span>
            ) : null}
          </div>

          <p className="mt-3 flex-1 text-xs leading-relaxed text-white/60">
            {(achievements?.badges ?? []).filter((b) => b.earned).length} badge tercapai dari{' '}
            {(achievements?.badges ?? []).length}, dihitung dari lomba, kehadiran, dan assessment
            yang tercatat.
          </p>

          <Link
            href="/portal/achievements"
            className="mt-4 block rounded-full bg-amber-400 py-2.5 text-center text-sm font-semibold text-neutral-900 transition-colors hover:bg-amber-300"
          >
            Lihat Badge
          </Link>
        </div>
      </section>
    </div>
  );
}
