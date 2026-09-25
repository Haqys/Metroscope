import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Banknote,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react';

import { FinanceSummary } from '@/components/internal/finance-summary';
import { KpiCard, type KpiCardProps } from '@/components/internal/kpi-card';
import { FINANCE_SUMMARY } from '@/components/internal/finance-data';
import { listInvoices, listStudentDirectory } from '@/lib/api';
import { formatIdr } from '@/lib/format';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';

export const metadata: Metadata = { title: 'Ringkasan Keuangan' };
export const dynamic = 'force-dynamic';

function kpisFor(awaiting: number, nunggak: number): KpiCardProps[] {
  return [
    {
      label: 'Pemasukan Bulan Ini',
      value: formatIdr(FINANCE_SUMMARY.income),
      caption: FINANCE_SUMMARY.period,
      icon: TrendingUp,
      tone: 'emerald',
    },
    {
      label: 'Biaya Operasional',
      value: formatIdr(FINANCE_SUMMARY.operational),
      caption: 'Fee mentor, dll',
      icon: TrendingDown,
      tone: 'navy',
    },
    {
      label: 'Menunggu Verifikasi',
      value: String(awaiting),
      caption: 'Bukti transfer masuk',
      icon: ShieldCheck,
      tone: 'amber',
      href: '/finance/verifications',
    },
    {
      label: 'Nunggak',
      value: String(nunggak),
      caption: 'Siswa perlu ditagih',
      icon: TriangleAlert,
      tone: 'maroon',
      href: '/finance/invoices?status=overdue',
    },
  ];
}

const SHORTCUTS = [
  {
    href: '/finance/invoices',
    label: 'Semua Tagihan',
    desc: 'Lihat, filter, dan tagih ulang',
    icon: ReceiptText,
  },
  {
    href: '/finance/verifications',
    label: 'Verifikasi Pembayaran',
    desc: 'Setujui bukti transfer masuk',
    icon: ShieldCheck,
  },
  {
    href: '/finance/invoices/new',
    label: 'Buat Tagihan',
    desc: 'Bulanan, lomba, materi, atau lainnya',
    icon: Wallet,
  },
  {
    href: '/finance/payments/new',
    label: 'Catat Pembayaran Offline',
    desc: 'Tunai atau transfer manual',
    icon: Banknote,
  },
];

/**
 * Internal, finance overview only (doc 12 §2).
 * The student database moved to `/students`; this page now owns money alone.
 */
export default async function FinancePage() {
  /**
   * Two of the four KPIs are counted from real tables (§3.6). The other two
   * stay in `finance-data.ts` because neither has one, see that file.
   */
  const [awaiting, directory] = await Promise.all([
    listInvoices({ status: 'AWAITING_VERIFICATION', limit: 200 }).catch(() => ({ items: [] })),
    listStudentDirectory().catch(() => ({ items: [] })),
  ]);
  const KPIS = kpisFor(
    awaiting.items.length,
    directory.items.filter((s) => s.payStatus === 'NUNGGAK').length,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Ringkasan Keuangan"
        subtitle="Pemasukan, tagihan, dan verifikasi pembayaran."
      />

      <div className="fx-stagger mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <section className="mt-10">
        <SectionHeading title="Aksi Cepat" />
        <div className="fx-stagger mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="fx-hover rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
            >
              <span className="bg-navy-light text-navy flex h-10 w-10 items-center justify-center rounded-xl">
                <s.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold text-neutral-900">{s.label}</p>
              <p className="mt-0.5 text-xs text-neutral-400">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <FinanceSummary {...FINANCE_SUMMARY} />
      </section>
    </div>
  );
}
