import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { Hero } from '@/components/marketing/hero';
import { JsonLd } from '@/components/marketing/json-ld';
import { ArticleCard } from '@/components/marketing/article-card';
import { ProgramCard } from '@/components/marketing/program-card';
import {
  BgWord,
  Counter,
  Parallax,
  Reveal,
  ScrollProgress,
  WordReveal,
} from '@/components/marketing/scroll-fx';
import { TestimonialSlider } from '@/components/marketing/testimonial-slider';
import { listArticles } from '@/lib/articles-api';
import { listPublicPrograms } from '@/lib/programs-api';
import { absolute, organizationJsonLd, social } from '@/lib/seo';

const TITLE = 'Metroscope. Bimbingan Olimpiade & Kompetisi';
const DESCRIPTION =
  'Bimbingan lomba untuk siswa SD–SMA di Denpasar: olimpiade, debat, dan karya tulis. Mentor spesialis, progress terpantau, konsultasi awal gratis.';

/** Character-for-character the `<loc>` the sitemap publishes, see `absolute`. */
const URL = absolute('/');
const SOCIAL = social({ title: TITLE, description: DESCRIPTION, url: URL });

/**
 * The home page had no canonical and no Open Graph tags at all, inherited only
 * the root layout's title and description. It is the most-shared URL on the
 * site and the one every "Metroscope" search resolves to.
 */
export const metadata: Metadata = {
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/* Dummy Unsplash photos until real assets land in /storage. */
const IMG = {
  classroom:
    'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8c3R1ZGVudHxlbnwwfHwwfHx8MA%3D%3D',
  studentPortrait:
    'https://images.unsplash.com/photo-1773332611514-238856b76198?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDF8MHxzZWFyY2h8MjJ8fHN0dWRlbnR8ZW58MHx8MHx8fDA%3D',
  studyGroup:
    'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTF8fHN0dWRlbnR8ZW58MHx8MHx8fDA%3D',
  winners:
    'https://images.unsplash.com/photo-1778218736185-8c0260add718?w=1600&auto=format&fit=crop&q=65&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8d2lubmVycyUyMHNhaW5zfGVufDB8fDB8fHww',
};

const STATS = [
  { to: 128, suffix: '+', label: 'Siswa aktif dibimbing' },
  { to: 40, suffix: '+', label: 'Gelar juara & finalis' },
  { to: 3, suffix: '', label: 'Program unggulan' },
  { to: 4.8, suffix: '/5', decimals: 1, label: 'Rating mentor' },
];

const JOURNEY = [
  {
    step: '01',
    title: 'Konsultasi gratis',
    body: 'Ngobrol dengan tim kami untuk menentukan program & jadwal yang pas. Tanpa komitmen, konfirmasi via email dalam 1×24 jam.',
  },
  {
    step: '02',
    title: 'Les rutin & terukur',
    body: 'Dua kali seminggu bersama mentor tetap. Jadwal otomatis sinkron ke Google Calendar, progress tercatat per topik.',
  },
  {
    step: '03',
    title: 'Persiapan intensif lomba',
    body: 'Jelang hari-H, latihan difokuskan ke kisi-kisi lomba target, kesiapan dipantau orang tua dari portal.',
  },
  {
    step: '04',
    title: 'Assessment & naik level',
    body: 'Setiap bulan mentor menilai secara terstruktur. Poin, badge, dan level membuat momentum belajar terjaga.',
  },
];

/** Three latest achievement stories on the homepage. */

/* Dummy Unsplash portraits until real testimonial photos land. */
const TESTIMONIALS = [
  {
    quote:
      'Anak saya jadi lebih percaya diri ikut lomba sejak bimbingan di Metroscope. Progressnya juga bisa saya pantau langsung dari portal.',
    name: 'Bunda Rani',
    role: 'Orang Tua Siswa · Olimpiade Sains',
    rating: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=60',
  },
  {
    quote:
      'Progress per topik bikin aku tahu persis bagian mana yang masih lemah. Pas hari-H OSK rasanya jauh lebih siap.',
    name: 'Aditya Pratama',
    role: 'Siswa SMP · Olimpiade Sains & Matematika',
    rating: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=60',
  },
  {
    quote:
      'Jadwal les otomatis masuk Google Calendar dan selalu ada reminder. Sebagai orang tua yang sibuk, ini sangat membantu.',
    name: 'Bapak Surya',
    role: 'Orang Tua Siswa · Debat & Public Speaking',
    rating: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=60',
  },
  {
    quote:
      'Mentornya sabar dan benar-benar paham medan lomba. Draft karya tulisku dibedah bab per bab sampai lolos ke final.',
    name: 'Nabila Putri',
    role: 'Siswa SMA · Karya Tulis & Riset',
    rating: 5,
    imageUrl:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=60',
  },
  {
    quote:
      'Assessment bulanannya jelas dan terukur, bukan sekadar pujian. Kami jadi tahu apa yang perlu ditingkatkan setiap bulan.',
    name: 'Bunda Sinta',
    role: 'Orang Tua Siswa · Karya Tulis & Riset',
    rating: 4,
    imageUrl:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&auto=format&fit=crop&q=60',
  },
];

export default async function HomePage() {
  /**
   * Three newest published articles, from the CMS.
   *
   * `listArticles` is tagged `articles`, so publishing purges the home page
   * along with every listing, the editor does not have to know that the home
   * page renders three of them.
   */
  const [{ items: latest }, programs] = await Promise.all([
    listArticles({ perPage: 3 }),
    listPublicPrograms(),
  ]);

  return (
    <>
      {/*
        `Organization`, once, on the page every crawler reaches first. Not in
        the shared layout: the node is the site's identity, and repeating it on
        sixty pages makes sixty claims where one is asked for. Everything else
        that needs it, `Article.publisher`, `Review.itemReviewed`, references
        `#organization` by id instead of restating it.
      */}
      <JsonLd docs={[organizationJsonLd()]} />

      <ScrollProgress />
      <Hero />

      {/* Everything after the hero slides over the pinned hero image */}
      <div className="relative z-10 bg-white">
        {/*,,, Editorial opening statement,,, */}
        <section className="relative overflow-hidden py-32 lg:py-44">
          <BgWord word="Prestasi" className="text-maroon" />
          <div className="relative container">
            <Reveal>
              <p className="text-maroon text-center text-xs font-medium tracking-[0.35em] uppercase">
                Metroscope
              </p>
            </Reveal>
            <h2 className="mx-auto mt-8 max-w-4xl text-center font-serif text-[clamp(2rem,4.5vw,3.75rem)] leading-[1.2] font-medium tracking-tight text-neutral-900">
              <WordReveal text="Setiap anak punya potensi juara. Tugas kami menyiapkan panggungnya, kurikulum per topik, mentor berpengalaman, dan pendampingan sampai hari-H." />
            </h2>
          </div>
        </section>

        {/*,,, Programs: sticky intro left, entries scroll right,,, */}
        <section id="program" className="container pb-32">
          <div className="grid gap-14 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-32">
                <Reveal>
                  <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
                    Program
                  </p>
                  <h2 className="mt-5 font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
                    Pilih Panggung Lombamu.
                  </h2>
                  <p className="mt-6 max-w-sm leading-relaxed font-light text-neutral-500">
                    Tiga jalur pembinaan untuk SD, SMP, dan SMA, masing-masing dengan mentor
                    spesialis di bidangnya.
                  </p>
                  <Link
                    href="/programs"
                    className="hover:border-maroon hover:text-maroon mt-8 inline-block rounded-full border border-neutral-300 px-7 py-3.5 text-sm font-medium text-neutral-900 transition-colors"
                  >
                    Semua Program
                  </Link>
                </Reveal>
              </div>
            </div>

            <div className="lg:col-span-8">
              {programs.map((program, i) => (
                <Reveal key={program.slug} delay={i * 100}>
                  <ProgramCard
                    index={i + 1}
                    slug={program.slug}
                    category={program.category}
                    name={program.name}
                    description={program.summary ?? program.description ?? ''}
                    imageUrl={program.coverUrl}
                    imageAlt={program.coverAlt}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/*,,, Impact: deep maroon band, animated counters,,, */}
        <section className="bg-maroon-deep relative overflow-hidden py-32 text-white lg:py-40">
          <BgWord word="Juara" className="text-white" />
          <div className="relative container">
            <Reveal>
              <p className="text-xs font-medium tracking-[0.35em] text-white/60 uppercase">
                Dampak Nyata
              </p>
            </Reveal>
            <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map((stat, i) => (
                <Reveal key={stat.label} delay={i * 120}>
                  <p className="font-serif text-[clamp(3.5rem,6vw,5.5rem)] leading-none font-medium">
                    <Counter to={stat.to} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
                  </p>
                  <p className="mt-4 text-sm font-light tracking-[0.2em] text-white/60 uppercase">
                    {stat.label}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/*,,, Journey: pinned image right, steps scroll left,,, */}
        <section className="container py-32">
          <div className="grid gap-14 lg:grid-cols-12">
            <div className="order-last lg:order-first lg:col-span-6">
              {JOURNEY.map((item) => (
                <div key={item.step} className="flex min-h-[60vh] items-center">
                  <Reveal className="border-l border-neutral-200 pl-10">
                    <p className="text-maroon/30 font-serif text-6xl leading-none italic">
                      {item.step}
                    </p>
                    <h3 className="mt-6 font-serif text-4xl font-medium tracking-tight text-neutral-900 sm:text-5xl">
                      {item.title}
                    </h3>
                    <p className="mt-5 max-w-md text-lg leading-relaxed font-light text-neutral-500">
                      {item.body}
                    </p>
                  </Reveal>
                </div>
              ))}
            </div>

            <div className="lg:col-span-6">
              <div className="lg:sticky lg:top-24">
                <Reveal>
                  <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
                    Perjalanan Siswa
                  </p>
                  <div className="relative mt-6 aspect-[4/5] overflow-hidden rounded-3xl lg:h-[calc(100vh-14rem)] lg:w-full">
                    <Image
                      src={IMG.classroom}
                      alt="Suasana kelas bimbingan Metroscope"
                      fill
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/*,,, Artikel: uniform editorial cards, from the CMS,,, */}
        <section id="articles" className="container pb-32">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
                  Artikel
                </p>
                <h2 className="mt-5 font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
                  Jejak Prestasi Siswa.
                </h2>
              </div>
              <Link
                href="/articles"
                className="bg-navy hover:bg-navy-dark mb-2 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-colors"
              >
                Lihat Semua Artikel →
              </Link>
            </div>
          </Reveal>

          {/*
            Nothing is rendered when the CMS has published nothing. An empty
            state on the home page would advertise that the business has no
            stories to tell, which is worse than the section not being there.
          */}
          {latest.length > 0 && (
            <div className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((article, i) => (
                <Reveal key={article.id} delay={i * 120}>
                  <ArticleCard article={article} />
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/*,,, Testimonials: photo cards + slider,,, */}
        <section id="testimoni" className="bg-navy-light/60 py-28 lg:py-36">
          <div className="container">
            <Reveal>
              <p className="text-navy text-center text-xs font-medium tracking-[0.35em] uppercase">
                Testimoni
              </p>
              <h2 className="mx-auto mt-5 max-w-2xl text-center font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
                Kata Orang Tua &amp; Siswa.
              </h2>
            </Reveal>
            <Reveal delay={200} className="mt-14">
              <TestimonialSlider items={TESTIMONIALS} />
            </Reveal>
          </div>
        </section>

        {/*,,, Full-width gallery with slow parallax,,, */}
        <section className="relative h-[70vh] overflow-hidden lg:h-[85vh]">
          <Parallax speed={-0.12} className="absolute inset-x-0 -inset-y-[10%]">
            <Image
              src={IMG.winners}
              alt="Siswa Metroscope merayakan kemenangan lomba"
              fill
              sizes="100vw"
              className="object-cover"
            />
          </Parallax>
          <div className="absolute inset-0 bg-black/25" aria-hidden />
          <p className="absolute bottom-10 left-1/2 w-full -translate-x-1/2 px-6 text-center text-xs font-medium tracking-[0.35em] text-white/80 uppercase">
            Podium OSN Kota. Batch 2026
          </p>
        </section>

        {/*,,, Closing CTA,,, */}
        <section className="relative overflow-hidden py-36 lg:py-48">
          <BgWord word="Mulai" className="text-maroon" />
          <div className="relative container text-center">
            <h2 className="mx-auto max-w-3xl font-serif text-[clamp(2.75rem,7vw,6rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
              <WordReveal text="Konsultasi" />{' '}
              <WordReveal text="gratis." startDelay={250} className="text-maroon italic" />
            </h2>
            <Reveal delay={400}>
              <p className="mx-auto mt-8 max-w-md text-lg leading-relaxed font-light text-neutral-500">
                Isi form, pilih jadwal, dan tim kami akan menghubungi via email dalam 1×24 jam.
              </p>
            </Reveal>
            <Reveal delay={550}>
              <div className="mt-12 flex justify-center gap-5">
                <Link
                  href="/register"
                  className="bg-maroon hover:bg-maroon-dark rounded-full px-10 py-4 text-sm font-medium tracking-wide text-white transition-all duration-300 hover:scale-[1.03]"
                >
                  Konsultasi Gratis
                </Link>
                <Link
                  href="/programs"
                  className="border-navy text-navy hover:bg-navy rounded-full border px-10 py-4 text-sm font-medium tracking-wide transition-colors hover:text-white"
                >
                  Lihat Program
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </>
  );
}
