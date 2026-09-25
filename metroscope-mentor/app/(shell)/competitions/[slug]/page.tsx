import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { CompetitionRecorder } from '@/components/internal/competition-recorder';
import { PageHeader } from '@/components/portal/page-header';
import { ApiError, getCompetition } from '@/lib/api';
import {
  FORMAT_LABEL,
  LEVEL_LABEL,
  MODE_LABEL,
  daysUntil,
  formatDeadline,
} from '@/lib/competition-display';

export const metadata: Metadata = { title: 'Detail Lomba' };
export const dynamic = 'force-dynamic';

/**
 * Mentor. One competition, and the students to record against it.
 *
 * The same endpoint the internal detail page reads; RLS returns the same rows,
 * because a mentor holding `/competitions` sees the whole participant list.
 * What differs is what this page OFFERS: readiness and results, and nothing
 * that would need `student.edit`.
 */
export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const detail = await getCompetition(slug).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  const c = detail.competition;
  const days = daysUntil(c.registrationDeadline);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/competitions"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Semua Lomba
      </Link>

      <PageHeader
        className="mt-4"
        title={c.name}
        subtitle={`${LEVEL_LABEL[c.level]} · ${FORMAT_LABEL[c.format]} · ${MODE_LABEL[c.mode]}, deadline ${formatDeadline(
          c.registrationDeadline,
        )}${days >= 0 ? ` (${days} hari lagi)` : ' (sudah lewat)'}`}
      />

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">
          Peserta <span className="text-neutral-400">({detail.participants.length})</span>
        </h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          Geser kesiapan dan isi hasil setelah lomba berlangsung.
        </p>
        <div className="mt-4">
          <CompetitionRecorder competitionId={c.id} participants={detail.participants} />
        </div>
      </div>
    </div>
  );
}
