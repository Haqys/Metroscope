import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { TutorForm } from '@/components/forms/tutor-form';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Tutor Baru' };

/** Internal, add a mentor (doc 12 §3). */
export default function NewTutorPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/team"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Manajemen Tutor
      </Link>

      <PageHeader
        className="mt-4"
        title="Tutor Baru"
        subtitle="Membuat akun mentor sekaligus data mengajar dan ketersediaan jadwalnya."
      />

      <div className="mt-8">
        <TutorForm />
      </div>
    </div>
  );
}
