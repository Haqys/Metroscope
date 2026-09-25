import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Compass, HeartHandshake, Target } from 'lucide-react';

import { Reveal } from '@/components/marketing/scroll-fx';
import { STOCK_IMAGES } from '@/lib/stock-images';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION =
  'Metroscope adalah bimbingan lomba untuk siswa SD–SMA, dari persiapan pertama sampai podium.';
const URL = absolute('/about');
const SOCIAL = social({ title: 'Tentang Kami · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Tentang Kami',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

const VALUES = [
  {
    icon: Target,
    title: 'Fokus ke panggung lomba',
    body: 'Kurikulum disusun mundur dari tanggal lomba: per topik, terukur, dan selalu tahu apa yang harus dikejar minggu ini.',
  },
  {
    icon: HeartHandshake,
    title: 'Mentor yang pernah di sana',
    body: 'Setiap mentor berpengalaman di bidang lombanya masing-masing, paham soal, paham juri, paham gugupnya hari-H.',
  },
  {
    icon: Compass,
    title: 'Orang tua ikut memantau',
    body: 'Progress, jadwal, pembayaran, dan assessment bulanan terbuka untuk orang tua lewat portal, tanpa perlu bertanya-tanya.',
  },
];

const STATS = [
  { value: '128+', label: 'Siswa aktif' },
  { value: '40+', label: 'Juara & finalis' },
  { value: '9', label: 'Mentor spesialis' },
  { value: '4.8/5', label: 'Rating orang tua' },
];

export default function AboutPage() {
  return (
    <>
      {/* Opening statement */}
      <section className="container pt-14 pb-16 lg:pt-24">
        <Reveal>
          <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
            Tentang Kami
          </p>
          <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.5rem,6vw,5.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
            Kami percaya setiap anak punya potensi <span className="text-maroon italic">juara</span>
            .
          </h1>
        </Reveal>
      </section>

      {/* Story + image */}
      <section className="container grid items-center gap-12 pb-20 lg:grid-cols-2">
        <Reveal>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image
              src={STOCK_IMAGES.winners}
              alt="Siswa Metroscope merayakan kemenangan lomba"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </Reveal>
        <Reveal delay={150}>
          <div className="space-y-5 text-lg leading-relaxed font-light text-neutral-600">
            <p>
              Metroscope berawal dari satu keyakinan sederhana: yang membedakan anak juara bukan
              bakat semata, melainkan{' '}
              <strong className="font-medium text-neutral-900">persiapan yang tepat</strong>,
              kurikulum yang terarah, mentor yang berpengalaman, dan pendampingan yang konsisten
              sampai hari-H.
            </p>
            <p>
              Hari ini kami membimbing siswa SD–SMA di tiga jalur lomba: olimpiade sains &amp;
              matematika, debat &amp; public speaking, serta karya tulis &amp; riset, dari
              konsultasi pertama sampai naik podium di tingkat kota, provinsi, dan nasional.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Values */}
      <section className="bg-navy-light/60 py-20">
        <div className="container">
          <Reveal>
            <h2 className="max-w-xl font-serif text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">
              Cara Kami Membimbing.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {VALUES.map((value, i) => (
              <Reveal key={value.title} delay={i * 120}>
                <div className="h-full rounded-3xl bg-white p-8 shadow-sm">
                  <span className="bg-maroon-light flex h-12 w-12 items-center justify-center rounded-full">
                    <value.icon className="text-maroon h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-serif text-2xl font-medium text-neutral-900">
                    {value.title}
                  </h3>
                  <p className="mt-3 leading-relaxed font-light text-neutral-500">{value.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats + CTA */}
      <section className="container py-24 text-center">
        <div className="grid grid-cols-2 gap-10 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 100}>
              <p className="text-maroon font-serif text-5xl font-medium tracking-tight">
                {stat.value}
              </p>
              <p className="mt-2 text-sm tracking-widest text-neutral-400 uppercase">
                {stat.label}
              </p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={300}>
          <Link
            href="/register"
            className="bg-maroon hover:bg-maroon-dark mt-16 inline-block rounded-full px-10 py-4 text-sm font-medium tracking-wide text-white transition-colors"
          >
            Mulai dari Konsultasi Gratis
          </Link>
        </Reveal>
      </section>
    </>
  );
}
