import type { InvoiceStatus } from '@/lib/api';

/**
 * Presentation for the billing pages.
 *
 * The database has eight invoice statuses; a parent needs four words. This maps
 * one to the other in a single place so the portal, the pay page and the bill
 * card cannot drift into three different vocabularies for the same row.
 */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  // Never rendered to a guardian. RLS hides drafts, but the map must be total.
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

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
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

/** A bill in one of these states can still be paid. */
export const PAYABLE: InvoiceStatus[] = ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'INSTALLMENT'];

export const formatIdr = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

export function formatDateId(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Whole days past the due date. Negative before it. */
export function daysPastDue(dueDate: string): number {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

/**
 * ⚠️ NO LATE FEE IS SHOWN HERE, deliberately.
 *
 * FR-PAY-6 defines one. Rp5.000/day after a 7-day grace, and the deleted
 * fixture computed it in the browser. Displaying a fee the SERVER does not know
 * about would tell a parent to transfer an amount Finance cannot reconcile: they
 * send amount + denda, the invoice says amount, and verification either
 * short-changes them or leaves a phantom balance.
 *
 * The fee becomes real when the billing run computes and stores it (doc 14
 * §1.6). Until then the portal shows the days overdue, which is true, and the
 * invoice amount, which is what Finance will actually check against.
 */
