import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { TaskForm } from '@/components/forms/task-form';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Buat & Assign Tugas Baru' };

/** Internal, task delegation wizard (wireframe: Input Form 1/6). */
export default function NewTaskPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/overview"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Papan Tugas
      </Link>

      <PageHeader
        className="mt-4"
        title="Buat & Assign Tugas Baru"
        subtitle="Delegasikan tugas ke role yang tepat dalam 4 langkah."
      />

      <div className="mt-10">
        <TaskForm />
      </div>
    </div>
  );
}
