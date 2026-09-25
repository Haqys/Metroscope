import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/portal/page-header';
import { listCompetitions } from '@/lib/api';
import {
  LEVEL_LABEL,
  PHASE_LABEL,
  PHASE_TONE,
  daysUntil,
  formatDeadline,
  readinessTone,
} from '@/lib/competition-display';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Lomba' };
export const dynamic = 'force-dynamic';

/**
 * Mentor, the competitions a mentor records results for (doc 13 §8.3).
 *
 * §3.4's migration granted MENTOR the `/competitions` page, which §8.3's matrix
 * always specified as a READ (`✅ r`) and the seed had never issued, so the
 * "record competition result" action in the same section named a record they
 * could not open. Reading is the page; writing readiness and a result is
 * `progress.edit`, which they already held.
 */
export default async function CompetitionsPage() {
  const { items } = await listCompetitions();
  const live = items.filter((c) => c.phase !== 'CLOSED');
  const past = items.filter((c) => c.phase === 'CLOSED');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Lomba" subtitle="Catat kesiapan dan hasil siswa yang kamu bimbing." />

      <div className="mt-8 space-y-8">
        <Section title="Sedang Berjalan" competitions={live} empty="Tidak ada lomba yang aktif." />
        {past.length > 0 ? (
          <Section title="Sudah Lewat" competitions={past} empty="" muted />
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  competitions,
  empty,
  muted = false,
}: {
  title: string;
  competitions: Awaited<ReturnType<typeof listCompetitions>>['items'];
  empty: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3 space-y-3">
        {competitions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
            {empty}
          </p>
        ) : (
          competitions.map((c) => {
            const days = daysUntil(c.registrationDeadline);
            return (
              <Link
                key={c.id}
                href={`/competitions/${c.slug}`}
                className={cn(
                  'fx-hover block rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]',
                  muted && 'opacity-70',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{c.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {LEVEL_LABEL[c.level]} · deadline {formatDeadline(c.registrationDeadline)}
                      {days >= 0 ? ` · ${days} hari lagi` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                      PHASE_TONE[c.phase],
                    )}
                  >
                    {PHASE_LABEL[c.phase]}
                  </span>
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  {c.targetCount} siswa terdaftar
                  {c.avgReadiness === null ? '' : ` · kesiapan rata-rata ${c.avgReadiness}%`}
                  {c.winnerCount > 0 ? ` · ${c.winnerCount} juara` : ''}
                </p>
                {c.avgReadiness !== null ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
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
          })
        )}
      </div>
    </section>
  );
}
