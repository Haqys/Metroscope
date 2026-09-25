'use client';

import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import type { CompetitionRow } from '@/lib/api';
import {
  LEVEL_LABEL,
  PHASE_LABEL,
  PHASE_TONE,
  daysUntil,
  formatDeadline,
  readinessTone,
} from '@/lib/competition-display';

/**
 * The competition database (doc 13 §12.8).
 *
 * Real as of §3.4. This table read three hardcoded rows from `schedule-data.ts`
 * whose own comment admitted `readiness` was "a number with nothing behind it",
 * there were no competition targets, so nothing computed it. Every column
 * here now comes from `competition_targets`, aggregated in the same statement
 * that returns the row.
 */
const columns: ColumnDef<CompetitionRow>[] = [
  {
    accessorKey: 'name',
    header: 'Lomba',
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          href={`/competitions/${row.original.slug}`}
          className="hover:text-navy block truncate font-medium text-neutral-900 transition-colors"
        >
          {row.original.name}
        </Link>
        <p className="mt-0.5 truncate text-xs text-neutral-400">
          {LEVEL_LABEL[row.original.level]}
          {row.original.organizer ? ` · ${row.original.organizer}` : ''}
        </p>
      </div>
    ),
  },
  {
    accessorKey: 'targetCount',
    header: 'Peserta',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {row.original.targetCount} siswa
        {row.original.teamCount > 0 ? ` · ${row.original.teamCount} tim` : ''}
      </span>
    ),
  },
  {
    accessorKey: 'avgReadiness',
    header: 'Kesiapan Rata-rata',
    cell: ({ row }) => {
      /**
       * NULL is not 0. "Nobody has been entered yet" and "everybody is at zero
       * readiness" are different findings, and the fixture's flat number could
       * express neither.
       */
      const pct = row.original.avgReadiness;
      if (pct === null) {
        return <span className="text-sm text-neutral-300">Belum ada peserta</span>;
      }
      return (
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn('fx-bar-x h-full rounded-full bg-gradient-to-r', readinessTone(pct))}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-neutral-900">{pct}%</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'registrationDeadline',
    header: 'Deadline',
    cell: ({ row }) => {
      const days = daysUntil(row.original.registrationDeadline);
      return (
        <div className="whitespace-nowrap">
          <p className="text-neutral-600">{formatDeadline(row.original.registrationDeadline)}</p>
          <p
            className={cn(
              'mt-0.5 text-xs',
              days < 0
                ? 'text-neutral-400'
                : days <= 7
                  ? 'text-maroon font-medium'
                  : 'text-neutral-400',
            )}
          >
            {days < 0 ? 'sudah lewat' : days === 0 ? 'hari ini' : `${days} hari lagi`}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: 'phase',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={cn(
          'inline-flex rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
          PHASE_TONE[row.original.phase],
        )}
      >
        {PHASE_LABEL[row.original.phase]}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Publikasi',
    cell: ({ row }) =>
      row.original.status === 'PUBLISHED' ? (
        <span className="text-xs text-neutral-500">Terbit</span>
      ) : (
        /**
         * An unpublished competition is invisible to families and to the
         * marketing calendar, the same row, the same publish state. Saying so
         * here is why nobody has to wonder which list a lomba is on.
         */
        <span className="text-xs font-medium text-amber-600">Belum terbit</span>
      ),
  },
];

export function CompetitionTable({ rows }: { rows: CompetitionRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      minWidth={860}
      emptyMessage="Belum ada lomba di database."
    />
  );
}
