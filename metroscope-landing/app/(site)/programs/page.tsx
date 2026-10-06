import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { PILLARS } from '@/lib/pillars-data';

import { ProgramCard } from '@/components/marketing/program-card';
import { EmptyState } from '@/components/ui/states';
import { Reveal, BgWord, WordReveal } from '@/components/marketing/scroll-fx';
import { listPublicPrograms } from '@/lib/programs-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION = 'Metroscope competition mentoring programs for elementary, junior, and senior high school students.';
const URL = absolute('/programs');
const SOCIAL = social({ title: 'Programmes · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Programmes',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};



export default async function ProgramsPage() {
  const programs = await listPublicPrograms();

  return (
    <main className="bg-white">
      {/* Hero Section */}
      <div className="container pt-14 lg:pt-24 pb-28">
        <Reveal>
          <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Programmes</p>
          <h1 className="mt-5 max-w-4xl font-serif text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
            <WordReveal text="Mentoring Portfolios." />
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
            A comprehensive overview of our mentoring frameworks designed to cultivate research excellence and competitive edge.
          </p>
        </Reveal>

        {programs.length === 0 ? (
          <div className="mt-16">
            <EmptyState
              title="Portfolios unavailable"
              description="We are currently updating our program portfolios. Please check back later."
            />
          </div>
        ) : (
          <div className="mt-16">
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
        )}
      </div>

      {/* 6 Pillars Section */}
      <section className="relative overflow-hidden bg-neutral-50 py-24 lg:py-36">
        <BgWord word="Pillar" className="text-neutral-200/50" />
        <div className="relative container">
          <div className="text-center">
            <Reveal>
              <h2 className="mx-auto font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[1.1] font-medium tracking-tight text-neutral-900">
                Metroscope Personalization
              </h2>
            </Reveal>
          </div>

          <div className="mt-20 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <Reveal key={pillar.title} delay={i * 100}>
                  <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-neutral-200/60 bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-maroon/5">
                    <div>
                      <div className="bg-maroon/10 text-maroon mb-6 inline-flex rounded-2xl p-4 transition-colors group-hover:bg-maroon group-hover:text-white">
                        <Icon className="h-7 w-7" />
                      </div>
                      <h3 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
                        {pillar.title}
                      </h3>
                      <p className="mt-4 leading-relaxed font-light text-neutral-500">
                        {pillar.body}
                      </p>
                    </div>
                    <div className="mt-8">
                      <Link 
                        href={`/programs/pillars/${pillar.slug}`}
                        className="inline-flex items-center text-sm font-medium text-maroon hover:text-maroon-dark transition-colors group/link"
                      >
                        View All 
                        <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
