import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { BillingRunReview } from '@/components/internal/billing-run-review';
import { InvoiceTable } from '@/components/internal/invoice-table';
import { PageHeader } from '@/components/portal/page-header';
import { listBillingRuns, listInvoices, type InvoiceStatus } from '@/lib/api';

export const metadata: Metadata = { title: 'Tagihan' };
export const dynamic = 'force-dynamic';

const TAB_STATUS: Record<string, InvoiceStatus | undefined> = {
  Semua: undefined,
  'Belum Bayar': 'UNPAID',
  Nunggak: 'OVERDUE',
  'Menunggu Verifikasi': 'AWAITING_VERIFICATION',
  Lunas: 'PAID',
};

interface PageProps {
  searchParams: Promise<{ tab?: string; view?: string }>;
}

/**
 * Every invoice, plus the monthly run waiting to be issued (doc 14 §1.6).
 *
 * Two jobs on one page because they are the same job at two moments: the run
 * view is what a month looks like before it goes out, the list is what it looks
 * like afterwards. Splitting them would mean Finance checking two places to
 * answer "did August go out, and did anyone pay?".
 */
export default async function InvoicesPage({ searchParams }: PageProps) {
  const { tab = 'Semua', view } = await searchParams;
  const isRunView = view === 'run';

  const [invoices, runs, drafts] = await Promise.all([
    listInvoices({ status: TAB_STATUS[tab], limit: 100 }),
    listBillingRuns(),
    // Only needed by the run view, but cheap and keeps the branch simple.
    // 100 is the API's cap; the review panel says so when a run exceeds it
    // rather than quietly showing a partial list of what is about to be issued.
    listInvoices({ status: 'DRAFT', limit: 100 }),
  ]);

  const draftRun = runs.find((r) => r.status === 'DRAFT');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Tagihan"
        subtitle="Semua tagihan siswa, dan penerbitan tagihan bulanan."
        badge={
          draftRun && !isRunView ? (
            <Link
              href="/finance/invoices?view=run"
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-200"
            >
              {draftRun.invoiceCount} draf menunggu ditinjau →
            </Link>
          ) : undefined
        }
        action={
          <Link
            href="/finance/invoices/new"
            className="bg-navy hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tagihan Manual
          </Link>
        }
      />

      <div className="mt-6 flex gap-2">
        <Link
          href="/finance/invoices"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            isRunView ? 'text-neutral-500 hover:bg-neutral-100' : 'bg-navy text-white'
          }`}
        >
          Daftar Tagihan
        </Link>
        <Link
          href="/finance/invoices?view=run"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            isRunView ? 'bg-navy text-white' : 'text-neutral-500 hover:bg-neutral-100'
          }`}
        >
          Penerbitan Bulanan
          {draftRun && !isRunView && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">
              {draftRun.invoiceCount}
            </span>
          )}
        </Link>
      </div>

      <div className="mt-6">
        {isRunView ? (
          <BillingRunReview runs={runs} drafts={drafts.items} />
        ) : (
          <InvoiceListView tab={tab} rows={invoices.items} />
        )}
      </div>
    </div>
  );
}

/** Server component, the tabs are links, so no client state is needed. */
function InvoiceListView({
  tab,
  rows,
}: {
  tab: string;
  rows: Awaited<ReturnType<typeof listInvoices>>['items'];
}) {
  return (
    <div>
      <SegmentedTabsLinks active={tab} />
      <div className="mt-5">
        <InvoiceTable rows={rows} />
      </div>
    </div>
  );
}

function SegmentedTabsLinks({ active }: { active: string }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-neutral-200/70 bg-neutral-100/70 p-1">
      {Object.keys(TAB_STATUS).map((label) => (
        <Link
          key={label}
          href={`/finance/invoices?tab=${encodeURIComponent(label)}`}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            label === active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
