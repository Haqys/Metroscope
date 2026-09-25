import type { Metadata } from 'next';

import { CoverageQueue } from '@/components/internal/coverage-queue';
import { PageHeader } from '@/components/portal/page-header';
import { listCoverage } from '@/lib/api';
import { formatPeriod } from '@/lib/assessment-display';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Assessment' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; q?: string }>;
}

/**
 * `/assessments`, the coverage queue (doc 03 FR-ASN-1, doc 13 §12.9).
 *
 * Real as of §3.5. Until now this page filtered a four-row fixture against a
 * hardcoded set of two slugs and printed the resulting percentage as coverage,
 * a number with the shape of accountability and nothing behind it, on the one
 * screen doc 13 §12.9 built to replace mentor ownership: "nobody owns a
 * student; everybody owns the number."
 *
 * The index is the queue, not a form entry point. `/assessments/new` is gone
 * (§T.1): the form lives at `/assessments/[slug]`, opened from a row, because
 * the queue is what decides who gets assessed next.
 */
export default async function AssessmentsPage({ searchParams }: PageProps) {
  const [{ period }, session] = await Promise.all([searchParams, requireSession()]);

  const coverage = await listCoverage({ period, status: 'all' });
  const canSubmit = session.actions.includes('assessment.submit');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Assessment ${formatPeriod(coverage.period)}`}
        subtitle={
          coverage.summary.total === 0
            ? 'Belum ada siswa aktif untuk dinilai.'
            : `${coverage.summary.pending} dari ${coverage.summary.total} siswa aktif belum dinilai periode ini.`
        }
      />

      <div className="mt-8">
        <CoverageQueue
          rows={coverage.items}
          summary={coverage.summary}
          period={coverage.period}
          canSubmit={canSubmit}
        />
      </div>
    </div>
  );
}
