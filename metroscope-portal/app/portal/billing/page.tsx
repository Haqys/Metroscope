import type { Metadata } from 'next';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

import { InvoiceTable } from '@/components/portal/invoice-table';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { listInvoices } from '@/lib/api';
import { daysPastDue, formatDateId, formatIdr, PAYABLE } from '@/lib/billing-display';

export const metadata: Metadata = { title: 'Tagihan & Pembayaran' };
export const dynamic = 'force-dynamic';

/**
 * The family's bills (FR-PAY-1).
 *
 * RLS scopes every row to `app.owns_student()`, so this fetches without a
 * student filter, adding one here would be a second, weaker copy of the rule
 * that decides what this family may see.
 */
export default async function BillingPage() {
  const { items } = await listInvoices({ limit: 50 });

  const outstanding = items.filter((i) => PAYABLE.includes(i.status));
  const oldest = outstanding[outstanding.length - 1];
  const totalDue = outstanding.reduce((sum, i) => sum + Math.max(i.amount - i.paidAmount, 0), 0);
  const overdueDays = oldest ? daysPastDue(oldest.dueDate) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tagihan & Pembayaran"
        subtitle="Semua tagihan program, beserta status pembayarannya."
      />

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Belum ada tagihan"
            description="Tagihan akan muncul di sini begitu pendaftaran diproses tim kami."
          />
        </div>
      ) : (
        <>
          {oldest && (
            <div
              className={`mt-8 rounded-2xl border p-6 ${
                overdueDays > 0
                  ? 'border-maroon/30 bg-maroon-light/40'
                  : 'border-amber-200/70 bg-amber-50/60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {overdueDays > 0 && (
                    <p className="text-maroon flex items-center gap-1.5 text-xs font-semibold">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      Terlambat {overdueDays} hari
                    </p>
                  )}
                  <p className="mt-1 text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
                    Total belum dibayar
                  </p>
                  <p className="text-navy mt-0.5 text-3xl font-bold tracking-tight">
                    {formatIdr(totalDue)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {outstanding.length} tagihan · terdekat jatuh tempo{' '}
                    {formatDateId(oldest.dueDate)}
                  </p>
                </div>

                <Link
                  href={`/portal/billing/pay?invoice=${oldest.id}`}
                  className="bg-maroon hover:bg-maroon-dark shrink-0 rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors"
                >
                  Bayar Sekarang
                </Link>
              </div>
            </div>
          )}

          <div className="mt-8">
            <InvoiceTable rows={items} />
          </div>
        </>
      )}
    </div>
  );
}
