import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  Newspaper,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Pusat Konten Web Klien' };

interface ContentCard {
  title: string;
  badge: string;
  href: string;
  publicHref: string;
  description: string;
  icon: typeof Sparkles;
  actionText: string;
}

const CONTENT_CARDS: ContentCard[] = [
  {
    title: 'Dampak & Prestasi (Our Impacts)',
    badge: 'metroscope.id/impacts',
    href: '/site/impacts',
    publicHref: 'https://metroscope.id/impacts',
    description:
      'Kelola cerita delegasi internasional (JISF 2026, Science Castle Asia 2025), foto panggung podium, dan ringkasan inovasi riset siswa.',
    icon: Sparkles,
    actionText: 'Kelola Cerita Dampak',
  },
  {
    title: 'Artikel & Wawasan (Insights & Articles)',
    badge: 'metroscope.id/articles',
    href: '/site/articles',
    publicHref: 'https://metroscope.id/articles',
    description:
      'Tulis dan publikasikan panduan olimpiade, tips bimbingan, studi kasus medali, serta artikel edukasi sains terapan.',
    icon: Newspaper,
    actionText: 'Tulis & Review Artikel',
  },
  {
    title: 'Program Edukasi (Programmes)',
    badge: 'metroscope.id/programs',
    href: '/site/programs',
    publicHref: 'https://metroscope.id/programs',
    description:
      'Perbarui deskripsi kurikulum, tingkatan jenjang (SD, SMP, SMA), dan spesifikasi program les yang ditampilkan di web klien.',
    icon: GraduationCap,
    actionText: 'Kelola Halaman Program',
  },
  {
    title: 'Antrean Penerbitan & Status (CMS Hub)',
    badge: 'Workflow Publikasi',
    href: '/site',
    publicHref: 'https://metroscope.id',
    description:
      'Pantau seluruh status konten: Draf yang sedang ditulis, menunggu persetujuan review, terjadwal, dan yang sudah terbit live.',
    icon: LayoutDashboard,
    actionText: 'Lihat Semua Antrean',
  },
];

export default function HomePage() {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Editorial Header matching Metroscope Landing style */}
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-7 shadow-xs sm:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-maroon/20 bg-maroon-light px-3 py-1 text-xs font-semibold text-maroon">
              <span className="h-1.5 w-1.5 rounded-full bg-maroon animate-pulse" />
              <span>Studio Konten Web Klien</span>
            </div>
            <h1 className="mt-3 font-sans text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              Halo, Tim Metroscope<span className="text-maroon">.</span>
            </h1>
            <p className="mt-1.5 text-sm text-neutral-500">
              Pusat pengelolaan dan publikasi konten untuk website utama klien (
              <span className="font-semibold text-neutral-700">metroscope.id</span>). Hari ini {today}.
            </p>
          </div>

          <a
            href="https://metroscope.id"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-neutral-800"
          >
            <span>Pratinjau Web Utama</span>
            <ExternalLink className="h-3.5 w-3.5 text-white/70" />
          </a>
        </div>
      </div>

      {/* Grid of Main Content Management Cards */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">Modul Konten Klien</h2>
          <span className="text-xs text-neutral-400">Pilih modul yang ingin diperbarui</span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {CONTENT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="group flex flex-col justify-between rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs transition-all duration-200 hover:border-neutral-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-maroon-light text-maroon transition-transform duration-200 group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="rounded-full border border-neutral-200/70 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                      {card.badge}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-bold text-neutral-900 group-hover:text-maroon transition-colors">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                    {card.description}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4">
                  <Link
                    href={card.href}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-maroon hover:underline"
                  >
                    <span>{card.actionText}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>

                  <a
                    href={card.publicHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-700"
                    title="Buka halaman publik di web klien"
                  >
                    <span>Cek Publik</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick live status footer banner */}
      <div className="rounded-2xl border border-neutral-200/70 bg-neutral-50/70 p-5 text-xs text-neutral-600">
        <p className="font-semibold text-neutral-800">
          💡 Tips Pengelolaan Konten:
        </p>
        <p className="mt-1 text-neutral-500 leading-relaxed">
          Semua konten yang diterbitkan di sini langsung terhubung ke website utama Metroscope.
          Anda dapat menambahkan foto delegasi internasional baru di menu{' '}
          <strong className="text-neutral-700">Dampak & Prestasi</strong> atau menulis draf artikel di menu{' '}
          <strong className="text-neutral-700">Artikel & Wawasan</strong>.
        </p>
      </div>
    </div>
  );
}
