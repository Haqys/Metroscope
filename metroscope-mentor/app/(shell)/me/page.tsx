import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, CalendarClock, ClipboardCheck, Users } from 'lucide-react';

import { KpiCard, type KpiCardProps } from '@/components/internal/kpi-card';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { listCoverage, listSessions } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { sessionRange } from '@/lib/session-display';
import { nameOf } from '@/lib/user-display';

export const metadata: Metadata = { title: 'Workspace Mentor' };

/**
 * KPIs the schedule can answer, and only those.
 *
 * "Total Siswa 128", "Assessment Pending 3" and "Fee Bulan Ini Rp4.200.000"
 * were literals, numbers a mentor would plan their week around, invented by a
 * fixture. Two of them come back in §3.5 (assessment coverage) and Phase 4
 * (mentor fees), computed from tables that will exist. The two below are
 * counted from real sessions; the rest are absent rather than fabricated, which
 * is the same call §0.4 made for the `/team` KPI row.
 */
function kpisFor(
  thisWeek: number,
  marked: number,
  unmarked: number,
  pendingAssessments: number,
): KpiCardProps[] {
  return [
    {
      label: 'Sesi Minggu Ini',
      value: String(thisWeek),
      caption: 'Yang kamu pegang',
      icon: CalendarClock,
      tone: 'violet',
      href: '/me/schedule',
    },
    {
      label: 'Belum Ditandai',
      value: String(unmarked),
      caption: unmarked === 0 ? 'Semua sesi tercatat' : 'Sesi lewat tanpa kehadiran',
      icon: ClipboardCheck,
      tone: unmarked > 0 ? 'amber' : 'emerald',
      href: '/me/schedule',
    },
    {
      label: 'Sesi Selesai',
      value: String(marked),
      caption: '30 hari terakhir',
      icon: Users,
      tone: 'navy',
      href: '/me/schedule',
    },
    {
      /**
       * Back, and real (§3.5). The comment above used to promise this: it was a
       * literal 3 in a fixture, and it now counts ACTIVE students with no
       * assessment for the current WITA month. Nobody owns a student; everybody
       * owns this number (doc 13 §12.9).
       */
      label: 'Belum Dinilai',
      value: String(pendingAssessments),
      caption: pendingAssessments === 0 ? 'Cakupan bulan ini penuh' : 'Siswa aktif bulan ini',
      icon: ClipboardCheck,
      tone: pendingAssessments > 0 ? 'amber' : 'emerald',
      href: '/assessments',
    },
  ];
}

const SHORTCUTS = [
  { href: '/progress', label: 'Update Progress Siswa', icon: BookOpen },
  { href: '/assessments', label: 'Isi Assessment', icon: ClipboardCheck },
  { href: '/materials', label: 'Kelola Materi Belajar', icon: BookOpen },
];

/** Mentor workspace home (doc 11 §7), the role that previously had no landing. */
export default async function MentorHomePage() {
  const session = await requireSession();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const weekAhead = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthBack = new Date(startOfDay.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [{ items }, coverage] = await Promise.all([
    listSessions({
      from: monthBack.toISOString(),
      to: weekAhead.toISOString(),
      scope: 'mine',
      limit: 500,
    }),
    listCoverage({ status: 'all' }),
  ]);

  const today = items.filter((s) => {
    const at = new Date(s.startsAt);
    return at >= startOfDay && at < endOfDay && s.status !== 'CANCELLED';
  });
  const thisWeek = items.filter((s) => new Date(s.startsAt) >= startOfDay).length;
  const marked = items.filter((s) => s.attendanceStatus !== null).length;
  const unmarked = items.filter(
    (s) => s.status === 'SCHEDULED' && new Date(s.startsAt) <= now,
  ).length;

  const KPIS = kpisFor(thisWeek, marked, unmarked, coverage.summary.pending);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Halo, ${nameOf(session)}`} subtitle="Ringkasan mengajar kamu hari ini." />

      <div className="fx-stagger mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <section className="mt-10 grid items-start gap-6 lg:grid-cols-12">
        {/* Today's schedule */}
        <div className="lg:col-span-7">
          <SectionHeading
            title="Jadwal Hari Ini"
            action={
              <Link
                href="/me/schedule"
                className="text-navy hover:text-navy-dark text-sm font-medium transition-colors"
              >
                Lihat semua →
              </Link>
            }
          />
          <div className="fx-stagger mt-4 space-y-2.5">
            {today.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-neutral-300 px-5 py-8 text-center text-sm text-neutral-400">
                Tidak ada sesi hari ini.
              </p>
            ) : (
              today.map((s) => (
                <div
                  key={s.id}
                  className="fx-hover flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
                >
                  <span className="bg-navy-light text-navy flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {s.studentName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">
                      {s.programName ?? 'Tanpa program'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-neutral-600">
                    {sessionRange(s)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Shortcuts */}
        <div className="lg:col-span-5">
          <SectionHeading title="Aksi Cepat" />
          <div className="fx-stagger mt-4 space-y-2.5">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="fx-hover flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-neutral-800">{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
