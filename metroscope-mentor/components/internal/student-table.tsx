'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import type { StudentDirectoryRow } from '@/lib/api';
import {
  PAY_LABEL,
  PAY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  formatIdr,
  lastTouchedLabel,
} from '@/lib/progress-display';

/**
 * The student directory (doc 12 §2, doc 14 §3.6).
 *
 * Real as of §3.6. Every column here used to come from `students-data.ts`,
 * including `payStatus`, a hand-typed 'Lunas' | 'Cicilan' | 'Nunggak' per
 * student, which is the same fact `invoices` already holds and the copy nobody
 * would ever update. It is now derived from the invoice statuses, and the
 * progress column from `app.progress_status()`, so this table and `/progress`
 * cannot disagree about who is overdue.
 */
const columns: ColumnDef<StudentDirectoryRow>[] = [
  {
    accessorKey: 'name',
    header: 'Nama Siswa',
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <span className="bg-navy-light text-navy flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
          {row.original.name
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-neutral-900">{row.original.name}</span>
          {row.original.level ? (
            <span className="block text-xs text-neutral-400">{row.original.level}</span>
          ) : null}
        </span>
      </div>
    ),
  },
  {
    id: 'program',
    header: 'Program',
    accessorFn: (r) => r.programNames,
    cell: ({ row }) => (
      <span className="text-neutral-700">
        {row.original.programNames || <span className="text-neutral-300">-</span>}
      </span>
    ),
  },
  {
    accessorKey: 'payStatus',
    header: 'Status Bayar',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            PAY_TONE[row.original.payStatus],
          )}
        >
          {PAY_LABEL[row.original.payStatus]}
        </span>
        {row.original.outstanding > 0 ? (
          <span className="mt-1 block text-xs text-neutral-400">
            {formatIdr(row.original.outstanding)}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    accessorKey: 'progressStatus',
    header: 'Progress',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
            STATUS_TONE[row.original.progressStatus],
          )}
        >
          {STATUS_LABEL[row.original.progressStatus]}
        </span>
        <span className="mt-1 block text-xs text-neutral-400">
          {lastTouchedLabel(row.original.progressStatus, row.original.progressDaysSince)}
        </span>
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/students/${row.original.slug}`}
        className="text-navy hover:text-navy-dark text-xs font-semibold whitespace-nowrap"
      >
        Profil →
      </Link>
    ),
  },
];

export function StudentTable({ rows }: { rows: StudentDirectoryRow[] }) {
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={rows}
      minWidth={860}
      onRowClick={(r) => router.push(`/students/${r.slug}`)}
      emptyMessage="Belum ada siswa terdaftar."
    />
  );
}
