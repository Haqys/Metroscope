import type { Metadata } from 'next';
import { ClipboardList, TriangleAlert, Users, Wallet } from 'lucide-react';

import { KpiCard, type KpiCardProps } from '@/components/internal/kpi-card';
import { NewTaskButton } from '@/components/internal/new-task-button';
import { TaskBoard } from '@/components/internal/task-board';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';

export const metadata: Metadata = { title: 'Overview & Management Tugas' };

/* ---------------------------------------------------------------------------
   Dummy KPIs mirroring the wireframe (Ringkasan 1/7) until the internal
   dashboard is wired to the API (students/tasks/finance modules).
--------------------------------------------------------------------------- */
const KPIS: KpiCardProps[] = [
  {
    label: 'Siswa Aktif',
    value: '128',
    caption: 'Database siswa',
    icon: Users,
    tone: 'navy',
    href: '/finance',
  },
  {
    label: 'Tugas Berjalan',
    value: '24',
    caption: 'Lintas semua role',
    icon: ClipboardList,
    tone: 'violet',
  },
  {
    label: 'Tugas Overdue',
    value: '3',
    caption: 'Perlu ditindaklanjuti',
    icon: TriangleAlert,
    tone: 'maroon',
    href: '/team',
  },
  {
    label: 'Pemasukan Bulan Ini',
    value: 'Rp 84,2 jt',
    caption: 'Juli 2026',
    icon: Wallet,
    tone: 'emerald',
    href: '/finance',
  },
];

/** Internal. Overview & Task Management (wireframe: Ringkasan 1/7). */
export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Overview & Management Tugas"
        subtitle="Ringkasan operasional dan papan tugas seluruh tim."
      />

      {/* KPI cards */}
      <div className="fx-stagger mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Task board */}
      <section className="mt-10">
        <SectionHeading
          title="Papan Tugas"
          subtitle="Delegasi dari Balqis · seret kartu untuk mengubah status"
          action={<NewTaskButton />}
        />
        <div className="mt-5">
          <TaskBoard />
        </div>
      </section>
    </div>
  );
}
