import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { AssessmentForm } from '@/components/forms/assessment-form';
import { PageHeader } from '@/components/portal/page-header';
import { ApiError, getStudentAssessments } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Isi Assessment' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}

/**
 * `/assessments/[id]`. One student, one period (doc 03 FR-ASN-3..5).
 *
 * `[id]` is the student's slug, which is what the queue links to and what the
 * old fixture already used. The IA §T.1 established is `/assessments` (queue) +
 * `/assessments/[id]` (form); `/assessments/new` is deleted rather than left as
 * a second, student-less way in.
 *
 * **Never statically generated.** What comes back depends on who is asking,
 * `assessments_select` shows a mentor every student and a guardian only their
 * own children, and a miss is a 404 that does not distinguish "no such
 * student" from "not one you may see".
 */
export default async function AssessmentDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, { period }, session] = await Promise.all([params, searchParams, requireSession()]);

  const data = await getStudentAssessments(id, period).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/assessments"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Antrean Assessment
      </Link>

      <PageHeader
        className="mt-4"
        title={data.current ? 'Koreksi Assessment' : 'Isi Assessment'}
        subtitle="Assessment terstruktur menggantikan testimoni bebas, dilakukan tiap akhir bulan."
      />

      <div className="mt-8">
        <AssessmentForm
          data={data}
          canSubmit={session.actions.includes('assessment.submit')}
          currentUserId={session.id}
        />
      </div>
    </div>
  );
}
