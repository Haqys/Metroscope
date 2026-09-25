'use client';

import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { EventDetailDialog, type CalendarEventData } from '@/components/ui/event-calendar';
import { cn } from '@/lib/utils';
import type { CompetitionRow } from '@/lib/api';
import {
  LEVEL_LABEL,
  MODE_LABEL,
  PHASE_LABEL,
  PHASE_TONE,
  daysUntil,
  formatDeadline,
} from '@/lib/competition-display';

import { competitionToEvent } from './competition-calendar';

/**
 * Info Lomba, as a table (doc 13 §12.8).
 *
 * Same rows as the calendar beside it, and the same rows the internal database
 * shows, `competition-data.ts` is deleted. Clicking a row opens the full
 * record, which is the one interaction the Airtable-style view exists for.
 */
const columns: ColumnDef<CompetitionRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nama Lomba',
    cell: ({ row }) => (
      <div className="max-w-[22rem]">
        <p className="truncate font-medium text-neutral-900" title={row.original.name}>
          {row.original.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-neutral-400">
          {row.original.organizer ?? 'Penyelenggara belum diisi'}
        </p>
      </div>
    ),
  },
  {
    accessorKey: 'registrationDeadline',
    header: 'Deadline',
    cell: ({ row }) => {
      const days = daysUntil(row.original.registrationDeadline);
      return (
        <div className="whitespace-nowrap">
          <p>{formatDeadline(row.original.registrationDeadline)}</p>
          <p className={cn('text-xs', days >= 0 && days <= 7 ? 'text-maroon' : 'text-neutral-400')}>
            {days < 0 ? 'sudah lewat' : days === 0 ? 'hari ini' : `${days} hari lagi`}
          </p>
        </div>
      );
    },
  },
  {
    id: 'level',
    header: 'Tingkat',
    accessorFn: (c) => LEVEL_LABEL[c.level],
  },
  {
    id: 'type',
    header: 'Bidang',
    accessorFn: (c) => c.categories.join(', '),
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.categories.map((t) => (
          <span
            key={t}
            className="bg-navy-light text-navy rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
          >
            {t}
          </span>
        ))}
        {row.original.categories.length === 0 ? (
          <span className="text-xs text-neutral-300">-</span>
        ) : null}
      </div>
    ),
  },
  {
    id: 'mode',
    header: 'Format',
    accessorFn: (c) => MODE_LABEL[c.mode],
  },
  {
    accessorKey: 'phase',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
          PHASE_TONE[row.original.phase],
        )}
      >
        {PHASE_LABEL[row.original.phase]}
      </span>
    ),
  },
];

export function CompetitionTable({ competitions }: { competitions: CompetitionRow[] }) {
  const [selected, setSelected] = useState<CalendarEventData | null>(null);

  return (
    <>
      <DataTable
        columns={columns}
        data={competitions}
        minWidth={820}
        onRowClick={(c) => setSelected(competitionToEvent(c))}
        emptyMessage="Belum ada lomba untuk kategori ini."
      />
      <EventDetailDialog event={selected} onClose={() => setSelected(null)} />
    </>
  );
}
