import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, FilePlus2 } from 'lucide-react';

import { formatIdr } from '@/lib/format';

/** Month finance snapshot + invoice CTA (wireframe: Ringkasan 3/7). */
export function FinanceSummary({
  period,
  income,
  operational,
}: {
  period: string;
  income: number;
  operational: number;
}) {
  const net = income - operational;

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-neutral-900">
            Ringkasan Finance Bulan Ini
          </h3>
          <p className="mt-0.5 text-xs text-neutral-400">{period}</p>
        </div>
        <Link
          href="/finance/invoices/new"
          className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
        >
          <FilePlus2 className="h-4 w-4" />
          Buat Invoice Baru
        </Link>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Pemasukan
          </dt>
          <dd className="mt-1 text-xl font-bold tracking-tight text-emerald-700">
            {formatIdr(income)}
          </dd>
        </div>

        <div className="rounded-xl border border-neutral-200/70 bg-neutral-50/70 p-4">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <ArrowDownRight className="h-3.5 w-3.5" />
            Biaya operasional
          </dt>
          <dd className="mt-1 text-xl font-bold tracking-tight text-neutral-700">
            {formatIdr(operational)}
          </dd>
          <p className="mt-0.5 text-[11px] text-neutral-400">fee mentor, dll</p>
        </div>

        <div className="border-navy/20 bg-navy-light/60 rounded-xl border p-4">
          <dt className="text-navy text-xs font-medium">Selisih bersih</dt>
          <dd className="text-navy mt-1 text-xl font-bold tracking-tight">{formatIdr(net)}</dd>
        </div>
      </dl>
    </div>
  );
}
