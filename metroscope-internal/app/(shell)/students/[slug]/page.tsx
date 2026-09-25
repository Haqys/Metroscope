import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { StudentProfileHeader } from '@/components/internal/student-profile-header';
import { StudentProfileTabs } from '@/components/internal/student-profile-tabs';
import { PageHeader } from '@/components/portal/page-header';
import { cn } from '@/lib/utils';
import {
  ApiError,
  getStudentAssessments,
  getStudentProgress,
  listCompetitions,
  listInvoices,
  listSessions,
  listStudentDirectory,
} from '@/lib/api';
import { PAY_LABEL, PAY_TONE } from '@/lib/progress-display';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * `/students/[slug]`, the 360° profile (wireframe: Ringkasan 4/7).
 *
 * **`generateStaticParams` is gone.** It pre-rendered a page per fixture slug
 * at build time, for a page whose every tab is one family's private record.
 * The same call §3.3 made for material detail pages, for the same reason.
 *
 * Composed from the modules that own each fact rather than from a profile
 * endpoint: sessions (§3.1), invoices (Phase 1), competitions (§3.4),
 * assessments (§3.5), progress (§3.6). A dedicated endpoint would have given
 * every one of those a second home.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Profil ${slug}` };
}

export const dynamic = 'force-dynamic';

export default async function StudentProfilePage({ params }: PageProps) {
  const { slug } = await params;

  const progress = await getStudentProgress(slug).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const studentId = progress.student.id;

  /**
   * The directory row carries the payment standing and the contact fields the
   * header renders. Looked up by name because the directory is a list endpoint;
   * a miss falls back to what `progress` already returned rather than 404ing a
   * page we have already proven the caller may see.
   */
  const [directory, sessions, invoices, assessments, competitions] = await Promise.all([
    listStudentDirectory(progress.student.name).catch(() => ({ items: [] })),
    listSessions({ studentId, limit: 20 }).catch(() => ({ items: [] })),
    listInvoices({ studentId, limit: 20 }).catch(() => ({ items: [] })),
    getStudentAssessments(studentId).catch(() => ({ items: [] })),
    listCompetitions({ studentId }).catch(() => ({ items: [] })),
  ]);

  const row = directory.items.find((s) => s.id === studentId) ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/students"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Database Siswa
      </Link>

      <PageHeader
        className="mt-4"
        title={`Profil Siswa: ${progress.student.name}`}
        subtitle={progress.student.programNames || 'Belum terdaftar di program mana pun'}
        badge={
          row ? (
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                PAY_TONE[row.payStatus],
              )}
            >
              {PAY_LABEL[row.payStatus]}
            </span>
          ) : undefined
        }
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          {row ? (
            <StudentProfileHeader student={row} />
          ) : (
            <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
              Detail identitas tidak tersedia untuk akun ini.
            </p>
          )}
        </div>
        <div className="lg:col-span-8">
          <StudentProfileTabs
            topics={progress.topics}
            sessions={sessions.items}
            invoices={invoices.items}
            assessments={assessments.items}
            competitions={competitions.items}
          />
        </div>
      </div>
    </div>
  );
}
