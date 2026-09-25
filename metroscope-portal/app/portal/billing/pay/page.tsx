import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Building2, Clock, TriangleAlert } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { ProofUpload } from '@/components/portal/proof-upload';
import { ApiError, getInvoice, listBankAccounts, listInvoices } from '@/lib/api';
import {
  daysPastDue,
  formatDateId,
  formatIdr,
  INVOICE_STATUS_LABEL,
  PAYABLE,
} from '@/lib/billing-display';

export const metadata: Metadata = { title: 'Bayar Tagihan' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ invoice?: string }>;
}

/**
 * Pay one invoice by manual transfer (FR-PAY-2).
 *
 * Three things a parent needs and cannot proceed without: the exact amount,
 * where to send it, and somewhere to put the proof. If any is missing the page
 * says so plainly rather than rendering a form that cannot work.
 */
export default async function PayPage({ searchParams }: PageProps) {
  const { invoice: invoiceId } = await searchParams;

  // No invoice named, fall back to the oldest payable one, which is what a
  // parent clicking "Bayar Sekarang" from a reminder almost always means.
  if (!invoiceId) {
    const { items } = await listInvoices({ limit: 50 });
    const payable = items.filter((i) => PAYABLE.includes(i.status));
    if (payable.length === 0) redirect('/portal/billing');
    redirect(`/portal/billing/pay?invoice=${payable[payable.length - 1]!.id}`);
  }

  const invoice = await getInvoice(invoiceId).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  });

  const accounts = (await listBankAccounts()).filter((a) => a.isActive);
  const overdue = daysPastDue(invoice.dueDate);
  const remaining = Math.max(invoice.amount - invoice.paidAmount, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/portal/billing"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Tagihan
      </Link>

      <PageHeader
        className="mt-4"
        title="Bayar Tagihan"
        subtitle={`${invoice.number} · ${invoice.studentName}`}
      />

      {invoice.status === 'AWAITING_VERIFICATION' ? (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-sky-200/70 bg-sky-50/60 p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div>
            <p className="text-sm font-semibold text-sky-800">Bukti transfer sedang diperiksa</p>
            <p className="mt-1 text-xs text-neutral-600">
              Dikirim{' '}
              {invoice.proofUploadedAt ? formatDateId(invoice.proofUploadedAt) : 'baru saja'}. Tim
              Keuangan akan mengabari lewat email. Tidak perlu mengirim ulang.
            </p>
          </div>
        </div>
      ) : !PAYABLE.includes(invoice.status) ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center">
          <p className="text-sm text-neutral-500">
            Tagihan ini berstatus {INVOICE_STATUS_LABEL[invoice.status]}. Tidak ada yang perlu
            dibayar.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {overdue > 0 && (
            <div className="border-maroon/30 bg-maroon-light/40 flex items-start gap-3 rounded-2xl border p-5">
              <TriangleAlert className="text-maroon mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-maroon text-sm font-semibold">Terlambat {overdue} hari</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Jatuh tempo {formatDateId(invoice.dueDate)}. Segera selesaikan agar akses belajar
                  tidak terganggu.
                </p>
              </div>
            </div>
          )}

          {/* 1. What to transfer */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white p-6">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
              Jumlah yang harus ditransfer
            </p>
            <p className="text-navy mt-1 text-3xl font-bold tracking-tight">
              {formatIdr(remaining)}
            </p>
            {invoice.paidAmount > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                Sudah dibayar {formatIdr(invoice.paidAmount)} dari {formatIdr(invoice.amount)}.
              </p>
            )}
            <p className="mt-3 text-xs text-neutral-500">
              Transfer <strong>tepat sejumlah ini</strong> supaya tim Keuangan bisa mencocokkannya.
              Jatuh tempo {formatDateId(invoice.dueDate)}.
            </p>
          </div>

          {/* 2. Where to send it */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white p-6">
            <h2 className="text-base font-semibold tracking-tight text-neutral-900">
              Rekening Tujuan
            </h2>

            {accounts.length === 0 ? (
              /*
                No account, no payment. Saying so beats an empty section that
                looks like a loading bug, and it tells the parent to contact
                staff instead of guessing an account number.
              */
              <div className="border-maroon/30 bg-maroon-light/40 mt-4 rounded-xl border p-4">
                <p className="text-maroon text-sm font-semibold">Rekening tujuan belum tersedia</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Mohon hubungi tim Metroscope lebih dulu, jangan transfer ke rekening mana pun
                  sebelum dikonfirmasi.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 rounded-xl bg-neutral-50/70 p-4"
                  >
                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">{a.bankName}</p>
                      <p className="font-mono text-lg tracking-wide text-neutral-900">
                        {a.accountNumber}
                      </p>
                      <p className="text-xs text-neutral-500">a.n. {a.accountHolder}</p>
                      {a.note && <p className="text-xs text-neutral-400">{a.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Prove it */}
          {accounts.length > 0 && <ProofUpload invoiceId={invoice.id} />}
        </div>
      )}
    </div>
  );
}
