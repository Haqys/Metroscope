import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { CompetitionForm } from '@/components/forms/competition-form';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Tambah Lomba' };

/** Internal, add a competition (doc 11 §3). */
export default function NewCompetitionPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/competitions"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Database Lomba
      </Link>

      <PageHeader
        className="mt-4"
        title="Tambah Lomba"
        subtitle="Lomba yang ditambahkan muncul di kalender tim dan katalog Info Lomba siswa."
      />

      <div className="mt-8">
        <CompetitionForm />
      </div>
    </div>
  );
}
