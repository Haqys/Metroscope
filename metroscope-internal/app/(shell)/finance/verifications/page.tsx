import type { Metadata } from 'next';

import { PaymentVerification } from '@/components/internal/payment-verification';
import { PageHeader } from '@/components/portal/page-header';
import { listInvoices } from '@/lib/api';

export const metadata: Metadata = { title: 'Verifikasi Pembayaran' };
export const dynamic = 'force-dynamic';

/**
 * The queue Finance works from (FR-PAY-3).
 *
 * One status filter over the same endpoint the portal uses. RLS decides that
 * Finance sees every family's invoices and a guardian sees only their own, so
 * there is no separate "admin" query that could drift from the customer one.
 */
export default async function VerificationsPage() {
  const { items } = await listInvoices({ status: 'AWAITING_VERIFICATION', limit: 100 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Verifikasi Pembayaran"
        subtitle="Bukti transfer yang dikirim orang tua dan menunggu diperiksa."
        badge={
          items.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              {items.length} menunggu
            </span>
          ) : undefined
        }
      />
      <div className="mt-8">
        <PaymentVerification rows={items} />
      </div>
    </div>
  );
}
