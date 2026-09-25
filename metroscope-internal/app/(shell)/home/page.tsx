import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { requireSession } from '@/lib/session';
import { nameOf } from '@/lib/user-display';

export const metadata: Metadata = { title: 'Beranda' };

/**
 * Beranda. One landing page for every internal role.
 *
 * Replaces "each role gets its own dashboard", which forced a Head+Mentor to
 * switch apps to see their own morning (doc 13 §8.2). Widgets are unlocked by
 * the page grants the account holds, so a custom role invented by the Head gets
 * a sensible home with no code change.
 *
 * ⚠️ Widget bodies show real counts once `/v1/inbox/counts` and the reports
 * endpoints land (doc 14 Phase 1.3 / Phase 4).
 */
interface Widget {
  /** Page grant that unlocks this widget. */
  requires: string;
  title: string;
  hint: string;
  href: string;
}

const WIDGETS: Widget[] = [
  {
    requires: '/leads',
    title: 'Pendaftar menunggu',
    hint: 'Antrean lead yang belum diputuskan',
    href: '/leads',
  },
  {
    requires: '/finance/verifications',
    title: 'Bukti transfer',
    hint: 'Menunggu verifikasi Keuangan',
    href: '/finance/verifications',
  },
  {
    requires: '/content-approval',
    title: 'Konten menunggu review',
    hint: 'Perlu keputusan Ketua',
    href: '/content-approval',
  },
  {
    requires: '/assessments',
    title: 'Siswa belum dinilai',
    hint: 'Cakupan assessment bulan ini',
    href: '/assessments',
  },
  { requires: '/tasks', title: 'Tugas saya', hint: 'Yang di-assign ke kamu', href: '/tasks' },
  {
    requires: '/schedule',
    title: 'Jadwal hari ini',
    hint: 'Sesi yang berjalan hari ini',
    href: '/schedule',
  },
  {
    requires: '/finance',
    title: 'Ringkasan keuangan',
    hint: 'Kas masuk, piutang, penagihan',
    href: '/finance',
  },
  { requires: '/students', title: 'Siswa aktif', hint: 'Database siswa', href: '/students' },
  {
    requires: '/team',
    title: 'Kinerja tim',
    hint: 'Penyelesaian tugas & ketersediaan',
    href: '/team',
  },
];

export default async function HomePage() {
  const session = await requireSession();
  // Page grants come straight from the API now, no local role table to drift.
  const granted = new Set(session.pages);
  const widgets = WIDGETS.filter((w) => granted.has(w.requires));

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Halo, ${nameOf(session)}`} subtitle={today} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className="group rounded-2xl border border-neutral-200/70 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <p className="text-sm font-semibold text-neutral-900">{w.title}</p>
            <p className="mt-1 text-xs text-neutral-500">{w.hint}</p>
            <span className="text-navy mt-4 inline-flex items-center gap-1 text-xs font-medium">
              Buka
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
