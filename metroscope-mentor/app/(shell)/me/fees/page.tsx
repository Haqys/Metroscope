import type { Metadata } from 'next';

import { formatIdr } from '@/components/internal/tutors-data';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';

export const metadata: Metadata = { title: 'Fee Mengajar Saya' };

/* Dummy until `GET /reports/mentor-fees?month=` is scoped to the current user. */
const FEE_PER_SESSION = 150_000;
const MONTHS = [
  { period: 'Juli 2026', sessions: 28, status: 'Berjalan' },
  { period: 'Juni 2026', sessions: 26, status: 'Dibayar' },
  { period: 'Mei 2026', sessions: 24, status: 'Dibayar' },
];

/** Mentor, own fee recap (doc 11 §6: mentor may see their own fee only). */
export default function MyFeesPage() {
  const current = MONTHS[0]!;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Fee Mengajar Saya"
        subtitle="Dihitung otomatis dari sesi berstatus Selesai × fee per sesi."
      />

      <div className="from-navy-dark shadow-navy/20 mt-8 rounded-2xl bg-gradient-to-br to-[#0b1730] p-7 text-white shadow-lg">
        <p className="text-[11px] font-semibold tracking-[0.28em] text-white/50 uppercase">
          {current.period}
        </p>
        <p className="mt-3 text-4xl font-bold tracking-tight text-amber-300">
          {formatIdr(current.sessions * FEE_PER_SESSION)}
        </p>
        <p className="mt-1.5 text-sm text-white/60">
          {current.sessions} sesi × {formatIdr(FEE_PER_SESSION)}
        </p>
      </div>

      <section className="mt-10">
        <SectionHeading title="Riwayat Bulanan" />
        <div className="fx-stagger mt-4 space-y-2.5">
          {MONTHS.map((m) => (
            <div
              key={m.period}
              className="fx-hover flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
            >
              <div>
                <p className="text-sm font-semibold text-neutral-900">{m.period}</p>
                <p className="mt-0.5 text-xs text-neutral-400">{m.sessions} sesi selesai</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-neutral-900">
                  {formatIdr(m.sessions * FEE_PER_SESSION)}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    m.status === 'Dibayar'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {m.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
