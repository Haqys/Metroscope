import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { CompetitionTable } from '@/components/internal/competition-table';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { listCompetitions } from '@/lib/api';
import { LEVEL_LABEL, daysUntil, formatDeadline, readinessTone } from '@/lib/competition-display';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Database Lomba' };
export const dynamic = 'force-dynamic';

/**
 * Internal, the competition database (doc 13 §12.8).
 *
 * Real as of §3.4. This page rendered three hardcoded rows while the portal
 * rendered three different hardcoded rows, which doc 13 §P7 named as the defect
 * and priced: "adding a lomba in the admin changes nothing for students". Both
 * now read `GET /v1/competitions`, and the marketing site reads the published
 * subset of the same table.
 */
export default async function CompetitionsPage() {
  const { items } = await listCompetitions();

  /** The nearest deadlines, which is the only ordering an ops team uses. */
  const soonest = items.filter((c) => c.phase !== 'CLOSED').slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Database Lomba"
        subtitle="Semua lomba yang sedang dikejar tim, beserta peserta dan kesiapannya."
        action={
          <Link
            href="/competitions/new"
            className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Lomba Baru
          </Link>
        }
      />

      {soonest.length > 0 ? (
        <div className="fx-stagger mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {soonest.map((c) => {
            const days = daysUntil(c.registrationDeadline);
            return (
              <Link
                key={c.id}
                href={`/competitions/${c.slug}`}
                className="fx-hover relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
              >
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-1',
                    days <= 7 ? 'bg-maroon' : days <= 30 ? 'bg-amber-500' : 'bg-emerald-500',
                  )}
                  aria-hidden
                />
                <p className="pl-2 text-sm font-semibold text-neutral-900">{c.name}</p>
                <p className="mt-0.5 pl-2 text-xs text-neutral-400">
                  {LEVEL_LABEL[c.level]} · deadline {formatDeadline(c.registrationDeadline)}
                </p>
                <p className="mt-3 pl-2 text-xs text-neutral-500">
                  {c.targetCount} siswa ditargetkan
                  {c.avgReadiness === null ? '' : ` · kesiapan ${c.avgReadiness}%`}
                </p>
                {c.avgReadiness !== null ? (
                  <div className="mt-2 ml-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={cn(
                        'fx-bar-x h-full rounded-full bg-gradient-to-r',
                        readinessTone(c.avgReadiness),
                      )}
                      style={{ width: `${c.avgReadiness}%` }}
                    />
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}

      <section className="mt-10">
        <SectionHeading
          title="Semua Lomba"
          subtitle="Peserta, kesiapan rata-rata, dan status publikasi di kalender publik"
        />
        <div className="mt-4">
          <CompetitionTable rows={items} />
        </div>
      </section>
    </div>
  );
}
