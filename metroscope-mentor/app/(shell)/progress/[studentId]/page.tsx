import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ProgressForm } from '@/components/forms/progress-form';
import { PageHeader } from '@/components/portal/page-header';
import { ApiError, getStudentProgress } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Update Progress Siswa' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studentId: string }>;
}

/**
 * `/progress/[studentId]`, the update form (doc 03 FR-UPD-2).
 *
 * `[studentId]` is the student's slug, which is what the board links to. The IA
 * §T.1 established is `/progress` (board) + `/progress/[studentId]` (form);
 * `/progress/update` is gone rather than left as a second, student-less way in.
 *
 * **Never statically generated.** What comes back depends on who is asking,
 * `progress_select` shows a mentor every student and a guardian only their own
 * children, and a miss is a 404 that does not distinguish "no such student"
 * from "not one you may see".
 */
export default async function ProgressDetailPage({ params }: PageProps) {
  const [{ studentId }, session] = await Promise.all([params, requireSession()]);

  const data = await getStudentProgress(studentId).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/progress"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Papan Progress
      </Link>

      <PageHeader
        className="mt-4"
        title="Update Progress Siswa"
        subtitle="Geser slider per topik. Perubahan langsung tampil di portal orang tua."
      />

      <div className="mt-8">
        <ProgressForm data={data} canEdit={session.actions.includes('progress.edit')} />
      </div>
    </div>
  );
}
