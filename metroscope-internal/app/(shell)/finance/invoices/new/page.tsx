import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { BillForm } from '@/components/forms/bill-form';
import { listStudents } from '@/lib/api';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Buat Tagihan' };

/**
 * Internal, issue a bill (online payment path).
 * Recording money already received offline lives at `/finance/payments/new`.
 */
export const dynamic = 'force-dynamic';

export default async function NewBillPage() {
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
        title="Buat Tagihan"
        subtitle="Terbitkan tagihan ke siswa. Orang tua membayar via transfer lalu mengunggah bukti di portal."
      />

      <div className="mt-8">
        <BillForm students={(await listStudents()).items} />
      </div>
    </div>
  );
}
