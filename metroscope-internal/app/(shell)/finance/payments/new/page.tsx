import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { OfflinePaymentForm } from '@/components/forms/offline-payment-form';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Catat Pembayaran Offline' };

/**
 * Internal, record money already received (cash / manual transfer).
 * Issuing a bill lives at `/finance/invoices/new`.
 */
export default function NewOfflinePaymentPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/finance/invoices"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Tagihan
      </Link>

      <PageHeader
        className="mt-4"
        title="Catat Pembayaran Offline"
        subtitle="Untuk pembayaran tunai atau transfer yang direkonsiliasi manual, bukan untuk menerbitkan tagihan."
      />

      <div className="mt-8">
        <OfflinePaymentForm />
      </div>
    </div>
  );
}
