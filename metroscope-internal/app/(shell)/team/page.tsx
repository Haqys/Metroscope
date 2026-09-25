import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, UserCheck, UserPlus, Users } from 'lucide-react';

import { KpiCard, type KpiCardProps } from '@/components/internal/kpi-card';
import { TeamView } from '@/components/internal/team-view';
import { PageHeader } from '@/components/portal/page-header';
import { listRoles, listUsers } from '@/lib/api';

export const metadata: Metadata = { title: 'Anggota Tim' };
export const dynamic = 'force-dynamic';

/**
 * Anggota Tim, the people who work here (doc 13 §4.3, doc 14 Task 0.4).
 *
 * The KPI row used to read `tutors-data.ts`: a fabricated average rating, a
 * fabricated monthly fee total, a fabricated session count. Numbers a manager
 * would act on, invented by a fixture. They are now counts derived from the
 * directory this page already loads, smaller claims, all of them true.
 *
 * Ratings, fees and session load return when `sessions` and `mentor_fees` exist
 * (doc 14 Phase 3–4), computed from those tables.
 */
export default async function TeamPage() {
  const [staff, roles] = await Promise.all([listUsers({ scope: 'staff' }), listRoles()]);

  const members = staff.items;
  const active = members.filter((m) => m.status === 'ACTIVE').length;
  const mentors = members.filter((m) => m.roles.includes('MENTOR')).length;
  const custom = roles.filter((r) => !r.isSystem && !r.isCustomer).length;

  const kpis: KpiCardProps[] = [
    {
      label: 'Anggota Tim',
      value: String(members.length),
      caption: 'Akun internal',
      icon: Users,
      tone: 'navy',
    },
    {
      label: 'Akun Aktif',
      value: String(active),
      caption: `${members.length - active} nonaktif`,
      icon: UserCheck,
      tone: 'emerald',
    },
    {
      label: 'Mentor',
      value: String(mentors),
      caption: 'Memegang role Mentor',
      icon: UserPlus,
      tone: 'violet',
    },
    {
      label: 'Role',
      value: String(roles.filter((r) => !r.isCustomer).length),
      caption: `${custom} role custom`,
      icon: ShieldCheck,
      tone: 'amber',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Anggota Tim"
        subtitle="Staf dan mentor, akun & role, serta kinerja."
        action={
          <Link
            href="/team/users/new"
            className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Anggota Baru
          </Link>
        }
      />

      <div className="fx-stagger mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="mt-10">
        <TeamView staff={members} roles={roles} />
      </div>
    </div>
  );
}
