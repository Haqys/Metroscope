'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/lib/api';
import {
  formatDateId,
  formatIdr,
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABEL,
  PAYABLE,
} from '@/lib/billing-display';

/** Every invoice for this family, newest first (FR-PAY-1). */
export function InvoiceTable({ rows }: { rows: Invoice[] }) {
  const router = useRouter();

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: 'number',
      header: 'No. Tagihan',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium text-neutral-900">
            {row.original.number}
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-400">{row.original.studentName}</p>
        </div>
      ),
    },
    { accessorKey: 'period', header: 'Periode' },
    {
      accessorKey: 'amount',
      header: 'Jumlah',
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="font-medium text-neutral-900">{formatIdr(row.original.amount)}</p>
          {row.original.paidAmount > 0 && row.original.paidAmount < row.original.amount && (
            <p className="mt-0.5 text-xs text-neutral-400">
              dibayar {formatIdr(row.original.paidAmount)}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'dueDate',
      header: 'Jatuh Tempo',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap text-neutral-500">
          {formatDateId(getValue<string>())}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap',
            INVOICE_STATUS_BADGE[row.original.status],
          )}
        >
          {INVOICE_STATUS_LABEL[row.original.status]}
        </span>
      ),
    },
    {
      id: 'action',
      header: '',
      enableSorting: false,
      cell: ({ row }) =>
        PAYABLE.includes(row.original.status) ? (
          <Link
            href={`/portal/billing/pay?invoice=${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-maroon text-xs font-semibold whitespace-nowrap hover:underline"
          >
            Bayar →
          </Link>
        ) : null,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      minWidth={760}
      onRowClick={(r) =>
        PAYABLE.includes(r.status) ? router.push(`/portal/billing/pay?invoice=${r.id}`) : undefined
      }
      emptyMessage="Belum ada tagihan."
    />
  );
}
