import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  Globe,
  MapPin,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Camera,
} from 'lucide-react';

import { Reveal, BgWord, WordReveal, Counter } from '@/components/marketing/scroll-fx';
import { listImpacts } from '@/lib/impacts-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION =
  'The academic milestones, international delegations, research achievements, and transformative student impacts realized by the Metroscope ecosystem.';
const URL = absolute('/impacts');
const SOCIAL = social({ title: 'Our Impacts · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Our Impacts',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

export default async function ImpactsPage() {
  const { stats, items } = await listImpacts();

  return (
    <main className="bg-white">
      {/* Spacer to account for fixed navbar */}
      <div className="h-20" aria-hidden />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-14 lg:py-24 border-b border-neutral-100">
        <BgWord word="Impact" className="text-maroon/5" />
        <div className="relative container text-center">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-maroon uppercase">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Our Footsteps &amp; Outcomes
            </span>
          </Reveal>
          <h1 className="mx-auto mt-6 max-w-4xl font-serif text-[clamp(2.5rem,5.5vw,4.75rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
            <WordReveal text="More than just winning competitions." />
          </h1>
          <Reveal delay={200}>
            <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl leading-relaxed font-light text-neutral-500">
              Cultivating young research scholars, building competitive resilience, and connecting junior high students to global scientific symposiums.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Impact Statistics */}
      {stats.length > 0 && (
        <section className="bg-neutral-50/70 border-b border-neutral-100 py-16">
          <div className="container">
            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {stats.map((stat, i) => (
                <Reveal key={stat.label} delay={i * 80}>
                  <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm">
                    <p className="font-serif text-4xl sm:text-5xl font-medium tracking-tight text-maroon">
                      <Counter to={stat.value} suffix={stat.suffix} prefix={stat.prefix} />
                    </p>
                    <p className="mt-3 text-sm font-semibold tracking-wider text-neutral-900 uppercase">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-xs font-light text-neutral-500 leading-relaxed">
                      {stat.sublabel}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Impact Stories & Delegations */}
      <section className="container py-20 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6 pb-12 border-b border-neutral-100">
          <div>
            <p className="text-maroon text-xs font-semibold tracking-[0.25em] uppercase">
              Case Studies &amp; Delegations
            </p>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-medium tracking-tight text-neutral-900">
              Transformative Student Journeys
            </h2>
          </div>
          <span className="text-xs font-mono text-neutral-400">
            {items.length} FEATURED ARCHIVES
          </span>
        </div>

        {items.length > 0 ? (
          <div className="mt-12 space-y-16 lg:space-y-24">
            {items.map((story, idx) => (
              <article
                key={story.id}
                className="grid gap-10 lg:grid-cols-12 items-start rounded-3xl border border-neutral-200/80 bg-white p-6 sm:p-10 shadow-sm transition-all hover:border-maroon/20 hover:shadow-md"
              >
                {/* Media / Cover Showcase (Left) */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-neutral-100">
                    <Image
                      src={story.coverUrl}
                      alt={story.coverAlt}
                      fill
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                      priority={idx === 0}
                    />
                    <div className="absolute top-4 left-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900/85 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                        <Globe className="h-3.5 w-3.5 text-amber-400" />
                        {story.categoryLabel}
                      </span>
                    </div>
                  </div>

                  {/* Sub-gallery thumbnails */}
                  {story.gallery && story.gallery.length > 1 && (
                    <div className="grid grid-cols-3 gap-3">
                      {story.gallery.slice(0, 3).map((photo, pIdx) => (
                        <div
                          key={pIdx}
                          className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100 border border-neutral-100"
                        >
                          <Image
                            src={photo.url}
                            alt={photo.alt}
                            fill
                            sizes="(min-width: 1024px) 15vw, 30vw"
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Story Narrative (Right) */}
                <div className="lg:col-span-6 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 pb-3 border-b border-neutral-100">
                      <span className="flex items-center gap-1.5 font-medium text-neutral-800">
                        <Calendar className="h-3.5 w-3.5 text-maroon" />
                        {story.year}
                      </span>
                      {story.location && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-maroon" />
                            {story.location}
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="mt-4 font-serif text-2xl sm:text-3xl font-medium tracking-tight text-neutral-900 leading-snug">
                      {story.title}
                    </h3>

                    {story.subtitle && (
                      <p className="mt-2 text-sm text-maroon font-medium italic">
                        {story.subtitle}
                      </p>
                    )}

                    {/* Highlight Metric Pill */}
                    <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-900">
                      <Award className="h-4 w-4 text-amber-600" />
                      <span>{story.metric}</span>
                    </div>

                    <p className="mt-5 text-base sm:text-lg leading-relaxed font-light text-neutral-600">
                      {story.summary}
                    </p>

                    {/* Key Takeaways */}
                    {story.keyTakeaways && story.keyTakeaways.length > 0 && (
                      <ul className="mt-6 space-y-2.5 text-sm font-light text-neutral-700">
                        {story.keyTakeaways.map((takeaway, tIdx) => (
                          <li key={tIdx} className="flex items-start gap-2.5">
                            <CheckCircle2 className="h-4 w-4 text-maroon shrink-0 mt-0.5" />
                            <span>{takeaway}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Footer Link to Program or Article */}
                  <div className="mt-8 pt-6 border-t border-neutral-100 flex items-center gap-4">
                    {story.programSlug && (
                      <Link
                        href={`/programs/${story.programSlug}`}
                        className="inline-flex items-center text-sm font-semibold text-maroon hover:text-maroon-dark transition-colors"
                      >
                        Read Full Delegation Story
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-3xl border border-dashed border-neutral-200/80 bg-neutral-50/50 p-12 sm:p-16 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-maroon/10 text-maroon mb-4">
              <Sparkles className="h-6 w-6" />
            </span>
            <h3 className="font-serif text-2xl font-medium text-neutral-900">
              Dokumentasi &amp; Arsip Cerita Sedang Dipersiapkan
            </h3>
            <p className="mt-2 text-sm text-neutral-500 max-w-md mx-auto leading-relaxed font-light">
              Kisah delegasi kompetisi sains dan publikasi riset terapan siswa Metroscope akan segera hadir di sini.
            </p>
          </div>
        )}
      </section>

      {/* Collaboration Callout */}
      <section className="container pb-28">
        <div className="relative overflow-hidden rounded-3xl bg-neutral-900 px-8 py-16 text-center sm:px-14 sm:py-20 text-white">
          <div className="relative z-10 max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-medium tracking-wider text-neutral-200 uppercase">
              <Camera className="h-3.5 w-3.5 text-maroon-light" />
              Impact Incubation
            </span>
            <h2 className="mt-6 font-serif text-3xl sm:text-4xl font-medium tracking-tight text-white leading-tight">
              Inspiring the Next Cohort of Young Researchers
            </h2>
            <p className="mt-4 text-neutral-300 font-light text-base sm:text-lg leading-relaxed">
              Every international podium begins with disciplined curiosity in secondary school. Discover how Metroscope prepares students for global stages.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link
                href="/programs"
                className="inline-flex items-center justify-center rounded-2xl bg-maroon px-7 py-3.5 text-sm font-medium text-white shadow-md transition-all hover:bg-maroon-dark hover:shadow-lg"
              >
                Explore Programmes &amp; Events
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
