import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PenLine } from 'lucide-react';

import { CompetitionDetailView } from '@/components/internal/competition-detail';
import { PageHeader } from '@/components/portal/page-header';
import { ApiError, getCompetition, listStudents } from '@/lib/api';

export const metadata: Metadata = { title: 'Detail Lomba' };
export const dynamic = 'force-dynamic';

/**
 * `/competitions/[slug]`, doc 13 §12.8: "participants, teams, readiness
 * distribution, deadline checklist".
 *
 * Dynamic, never statically generated: what comes back depends on who is
 * asking. `97_competitions.sql` shows a Secretary every participant and a
 * guardian only their own children, from this same endpoint.
 *
 * Editing the lomba itself sends you to the CMS. A competition is a registered
 * content type, its copy, its slug and its publish state belong to the
 * pipeline that already handles articles, programmes and mentor profiles, and
 * a second editor here would be the second source of truth in miniature.
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
  const students = await listStudents();

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/competitions"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Database Lomba
      </Link>

      <PageHeader
        className="mt-4"
        title={detail.competition.name}
        subtitle="Peserta, tim, sebaran kesiapan, dan checklist menuju deadline."
        action={
          <Link
            href={`/site/collections/competition/${detail.competition.id}`}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300"
          >
            <PenLine className="h-4 w-4" />
            Edit di CMS
          </Link>
        }
      />

      <div className="mt-8">
        <CompetitionDetailView detail={detail} students={students.items} />
      </div>
    </div>
  );
}
