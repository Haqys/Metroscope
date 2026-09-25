'use client';

import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import type { SessionRow } from '@/lib/api';
import {
  ATTENDANCE_BADGE,
  ATTENDANCE_LABEL,
  sessionDate,
  sessionRange,
} from '@/lib/session-display';
import { cn } from '@/lib/utils';

const columns: ColumnDef<SessionRow>[] = [
  {
    accessorKey: 'startsAt',
    header: 'Tanggal',
    cell: ({ row }) => (
      <span className="font-medium whitespace-nowrap text-neutral-800">
        {sessionDate(row.original.startsAt)}
      </span>
    ),
  },
  {
    id: 'time',
    header: 'Jam',
    cell: ({ row }) => <span className="whitespace-nowrap">{sessionRange(row.original)}</span>,
  },
  { accessorKey: 'studentName', header: 'Siswa' },
  { accessorKey: 'mentorName', header: 'Mentor' },
  {
    accessorKey: 'attendanceStatus',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.attendanceStatus;
      /**
       * A session can be over without anybody having marked it. "Belum dicatat"
       * is the honest rendering, the old fixture only ever held Hadir or Izin,
       * so the table had no way to say the mentor had not filled it in.
       */
      if (!status) return <span className="text-xs text-neutral-400">Belum dicatat</span>;
      return (
        <span
          className={cn('rounded-full px-3 py-1 text-xs font-medium', ATTENDANCE_BADGE[status])}
        >
          {ATTENDANCE_LABEL[status]}
        </span>
      );
    },
  },
];

/** Attendance history (sessions that have happened). Airtable-style. */
export function AttendanceTable({ sessions }: { sessions: SessionRow[] }) {
  return <DataTable columns={columns} data={sessions} />;
}
