import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheckBig, Clock3, GraduationCap, Inbox, TriangleAlert } from 'lucide-react';

import { KpiCard, type KpiCardProps } from '@/components/internal/kpi-card';
import { StudentTable } from '@/components/internal/student-table';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { listStudentDirectory } from '@/lib/api';

export const metadata: Metadata = { title: 'Database Siswa' };
export const dynamic = 'force-dynamic';

/**
 * Internal, the student database (doc 12 §2, doc 14 §3.6).
 *
 * Real as of §3.6. The four KPIs above the table were literals in a fixture,
 * `{ total: 128, lunas: 104, cicilan: 18, nunggak: 6 }`, numbers a Head would
 * read as the size of the business. They are now counted from the rows that
 * came back, and the payment standing behind each one is derived from
 * `invoices` rather than typed beside a student's name.
 */
export default async function StudentsPage() {
  const { items } = await listStudentDirectory();

  const count = (status: string) => items.filter((s) => s.payStatus === status).length;
  const KPIS: KpiCardProps[] = [
    {
      label: 'Total Siswa',
      value: String(items.length),
      caption: 'Siswa terdaftar',
      icon: GraduationCap,
      tone: 'navy',
    },
    {
      label: 'Lunas',
      value: String(count('LUNAS')),
      caption: 'Tidak ada tagihan terbuka',
      icon: CircleCheckBig,
      tone: 'emerald',
    },
    {
      label: 'Cicilan',
      value: String(count('CICILAN')),
      caption: 'Bayar bertahap',
      icon: Clock3,
      tone: 'amber',
    },
    {
      label: 'Nunggak',
      value: String(count('NUNGGAK')),
      caption: 'Perlu follow up',
      icon: TriangleAlert,
      tone: 'maroon',
      href: '/finance/invoices',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Database Siswa"
        subtitle="Semua siswa beserta program, status pembayaran, dan kondisi progress-nya."
        action={
          <Link
            href="/leads"
            className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <Inbox className="h-4 w-4" />
            Pendaftar Baru
          </Link>
        }
      />

      <div className="fx-stagger mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Daftar Siswa"
          subtitle="Klik baris untuk membuka profil 360°"
          action={
            <Link
              href="/leads"
              className="text-navy hover:text-navy-dark text-sm font-medium transition-colors"
            >
              Antrian follow-up →
            </Link>
          }
        />
        <div className="mt-4">
          <StudentTable rows={items} />
        </div>
      </section>
    </div>
  );
}
