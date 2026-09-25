'use client';

import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import type { Invoice, InvoiceStatus } from '@/lib/api';

const formatIdr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const formatDateId = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Staff-facing status vocabulary.
 *
 * Deliberately the same words the portal shows a parent, so a phone call about
 * "Menunggu Verifikasi" means the same thing on both ends of the line. DRAFT is
 * the one entry parents never see. RLS hides those rows from them.
 */
const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draf',
  UNPAID: 'Belum Bayar',
  OVERDUE: 'Nunggak',
  AWAITING_VERIFICATION: 'Menunggu Verifikasi',
  PARTIALLY_PAID: 'Cicilan',
  INSTALLMENT: 'Cicilan',
  PAID: 'Lunas',
  VOID: 'Dibatalkan',
  REFUNDED: 'Dikembalikan',
};

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-neutral-200 text-neutral-500',
  UNPAID: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-maroon-light text-maroon',
  AWAITING_VERIFICATION: 'bg-sky-100 text-sky-700',
  PARTIALLY_PAID: 'bg-navy-light text-navy',
  INSTALLMENT: 'bg-navy-light text-navy',
  PAID: 'bg-emerald-100 text-emerald-700',
  VOID: 'bg-neutral-200 text-neutral-500',
  REFUNDED: 'bg-neutral-200 text-neutral-500',
};

const TYPE_LABEL: Record<string, string> = {
  REGISTRATION: 'Pendaftaran',
  MONTHLY: 'Bulanan',
  COMPETITION: 'Lomba',
  MATERIAL: 'Materi',
  EXTRA: 'Lainnya',
};

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
  {
    accessorKey: 'type',
    header: 'Jenis',
    cell: ({ getValue }) => TYPE_LABEL[getValue<string>()] ?? getValue<string>(),
  },
  { accessorKey: 'period', header: 'Periode' },
  {
    accessorKey: 'amount',
    header: 'Jumlah',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <p className="font-medium text-neutral-900">{formatIdr(row.original.amount)}</p>
        {/* Only shown when it is not the whole story, a partially settled bill. */}
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
      <span className="whitespace-nowrap text-neutral-500">{formatDateId(getValue<string>())}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap',
          STATUS_BADGE[row.original.status],
        )}
      >
        {STATUS_LABEL[row.original.status]}
      </span>
    ),
  },
];

/** Every invoice Finance can see (FR-PAY-1). */
export function InvoiceTable({ rows }: { rows: Invoice[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      minWidth={880}
      emptyMessage="Tidak ada tagihan di kategori ini."
    />
  );
}
