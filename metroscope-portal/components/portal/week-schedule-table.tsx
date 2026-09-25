'use client';

import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';

export interface WeekScheduleRow {
  day: string;
  time: string;
  mentor: string;
  status: string;
}

const STATUS: Record<string, string> = {
  Terjadwal: 'bg-emerald-100 text-emerald-700',
  Menunggu: 'bg-amber-100 text-amber-700',
};

const columns: ColumnDef<WeekScheduleRow>[] = [
  {
    accessorKey: 'day',
    header: 'Hari / Tanggal',
    cell: ({ getValue }) => (
      <span className="font-medium whitespace-nowrap text-neutral-800">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'time',
    header: 'Waktu',
    cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue<string>()}</span>,
  },
  { accessorKey: 'mentor', header: 'Mentor' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-medium',
          STATUS[row.original.status] ?? 'bg-neutral-100 text-neutral-500',
        )}
      >
        {row.original.status}
      </span>
    ),
  },
];

/** This-week schedule snapshot on the dashboard. Airtable-style. */
export function WeekScheduleTable({ rows }: { rows: readonly WeekScheduleRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows as WeekScheduleRow[]}
      minWidth={560}
      emptyMessage="Belum ada jadwal minggu ini."
    />
  );
}
