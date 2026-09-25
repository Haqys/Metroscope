import type { Metadata } from 'next';
import { Mail } from 'lucide-react';

import { ADMIN_EMAIL } from '@/lib/constants';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';

export const metadata: Metadata = { title: 'Bantuan' };

/**
 * Portal, help centre.
 *
 * Without this, every parent question becomes an ad-hoc message to staff, the
 * manual load this product exists to remove (doc 13 §6.1).
 *
 * ⚠️ The FAQ below is a starter set held in this file. It moves to the CMS in
 * Phase 2 (doc 14) so one written answer serves the portal, the public /faq page
 * and the FAQPage JSON-LD at once.
 */
const FAQ = [
  {
    q: 'Bagaimana cara membayar tagihan?',
    a: 'Buka menu Tagihan, salin nomor rekening tujuan, lakukan transfer sesuai nominal, lalu unggah bukti transfer. Tim Keuangan memverifikasi maksimal 1×24 jam.',
  },
  {
    q: 'Kenapa ada denda di tagihan saya?',
    a: 'Ada masa tenggang 7 hari setelah jatuh tempo tanpa denda. Mulai hari ke-8, denda Rp5.000 dan bertambah Rp5.000 setiap hari berikutnya. Rinciannya selalu ditampilkan di halaman Tagihan.',
  },
  {
    q: 'Bagaimana cara mengganti jadwal les?',
    a: 'Buka Jadwal Les, pilih sesi yang ingin diubah, lalu ajukan reschedule paling lambat H-1. Tim mengonfirmasi dalam 1×24 jam.',
  },
  {
    q: 'Kapan hasil assessment keluar?',
    a: 'Mentor mengisi assessment di akhir setiap bulan. Kamu akan menerima notifikasi begitu hasilnya terbit.',
  },
  {
    q: 'Materi saya terkunci, kenapa?',
    a: 'Modul terbuka mengikuti progress belajar. Modul berikutnya terbuka setelah modul sebelumnya selesai atau setelah mentor membukanya.',
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Bantuan" subtitle="Pertanyaan yang sering ditanyakan orang tua." />

      <section className="mt-8">
        <SectionHeading title="Pertanyaan Umum" />
        <div className="mt-4 divide-y divide-neutral-200/70 rounded-2xl border border-neutral-200/70 bg-white">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-neutral-900 marker:hidden">
                {item.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading title="Masih butuh bantuan?" />
        <a
          href={`mailto:${ADMIN_EMAIL}`}
          className="hover:border-navy/40 mt-4 flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white p-5 transition-colors"
        >
          <span className="bg-navy-light text-navy flex h-11 w-11 items-center justify-center rounded-xl">
            <Mail className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-neutral-900">
              Hubungi tim lewat email
            </span>
            <span className="mt-0.5 block text-xs text-neutral-500">
              Dibalas pada jam kerja Senin–Sabtu, 09.00–17.00 WITA
            </span>
          </span>
        </a>
      </section>
    </div>
  );
}
