import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { SessionForm } from '@/components/forms/session-form';
import { PageHeader } from '@/components/portal/page-header';
import { listStudents, listUsers } from '@/lib/api';

export const metadata: Metadata = { title: 'Tambah Jadwal Les' };
export const dynamic = 'force-dynamic';

/**
 * Internal, create lesson sessions, single or recurring (doc 12 §3).
 *
 * Both pickers are loaded server-side from the real directories. The mentor
 * list is every staff account holding MENTOR: doc 12 §9.1 removed mentor
 * assignment, so any mentor may teach any student and the list is not filtered
 * by the chosen child.
 */
export default async function NewSessionPage() {
  const [students, staff] = await Promise.all([listStudents(), listUsers({ scope: 'staff' })]);
  const mentors = staff.items.filter((m) => m.roles.includes('MENTOR') && m.status === 'ACTIVE');

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/schedule"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Jadwal
      </Link>

      <PageHeader
        className="mt-4"
        title="Tambah Jadwal Les"
        subtitle="Buat sesi les rutin, assessment, atau konsultasi: sekali atau berulang mingguan."
      />

      <div className="mt-8">
        <SessionForm students={students.items} mentors={mentors} />
      </div>
    </div>
  );
}
