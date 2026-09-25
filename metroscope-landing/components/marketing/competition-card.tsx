import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  LEVEL_LABEL,
  MODE_LABEL,
  PHASE_LABEL,
  daysUntil,
  formatDeadline,
  type PublicCompetition,
} from '@/lib/competitions-api';

const PHASE_TONE: Record<PublicCompetition['phase'], string> = {
  OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  UPCOMING: 'bg-amber-50 text-amber-700 ring-amber-200',
  CLOSED: 'bg-neutral-100 text-neutral-500 ring-neutral-200',
};

/**
 * One competition on the public calendar.
 *
 * The countdown is computed at render rather than stored, which is the same
 * decision `app.competition_phase()` makes in the database, a stored
 * "Ongoing" is a claim that outlives its own deadline, and the deleted portal
 * fixture had one on every row.
 */
export function CompetitionCard({ competition: c }: { competition: PublicCompetition }) {
  const days = daysUntil(c.registrationDeadline);

  return (
    <Link
      href={`/competitions/${c.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-neutral-200/70 bg-white p-6 transition-colors hover:border-neutral-300"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
            PHASE_TONE[c.phase],
          )}
        >
          {PHASE_LABEL[c.phase]}
        </span>
        <span className="text-[11px] tracking-wide text-neutral-400 uppercase">
          {LEVEL_LABEL[c.level]} · {MODE_LABEL[c.mode]}
        </span>
      </div>

      <h3 className="group-hover:text-maroon mt-4 font-serif text-xl leading-snug font-medium tracking-tight text-neutral-900 transition-colors">
        {c.name}
      </h3>

      {c.summary ? (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed font-light text-neutral-500">
          {c.summary}
        </p>
      ) : null}

      <div className="mt-auto pt-6">
        <p className="text-sm font-medium text-neutral-900">
          Deadline {formatDeadline(c.registrationDeadline)}
        </p>
        <p
          className={cn(
            'mt-0.5 text-xs',
            days >= 0 && days <= 14 ? 'text-maroon' : 'text-neutral-400',
          )}
        >
          {days < 0
            ? 'Pendaftaran sudah ditutup'
            : days === 0
              ? 'Hari terakhir pendaftaran'
              : `${days} hari lagi`}
        </p>

        {c.levels.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {c.levels.map((level) => (
              <span
                key={level}
                className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600"
              >
                {level}
              </span>
            ))}
          </div>
        ) : null}

        <span className="text-maroon mt-5 inline-flex items-center gap-1 text-sm font-medium">
          Lihat detail
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  );
}
