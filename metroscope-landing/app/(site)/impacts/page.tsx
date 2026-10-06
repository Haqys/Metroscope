import type { Metadata } from 'next';

import { Reveal, BgWord, WordReveal } from '@/components/marketing/scroll-fx';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION = 'The social and personal impacts brought by the Metroscope ecosystem.';
const URL = absolute('/impacts');
const SOCIAL = social({ title: 'Our Impacts · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Our Impacts',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

export default function ImpactsPage() {
  return (
    <main className="bg-white">
      {/* Spacer to account for fixed navbar */}
      <div className="h-20" aria-hidden />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-14 lg:py-24">
        <BgWord word="Impacts" className="text-maroon/5" />
        <div className="relative container text-center">
          <Reveal>
            <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
              Our Impacts
            </p>
          </Reveal>
          <h1 className="mx-auto mt-6 max-w-4xl font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.1] font-medium tracking-tight text-neutral-900">
            <WordReveal text="More than just winning competitions." />
          </h1>
          <Reveal delay={200}>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed font-light text-neutral-500">
              The footsteps, achievements, and social impacts realized by the Metroscope ecosystem. 
            </p>
          </Reveal>
        </div>
      </section>

      {/* Placeholder for future impacts content */}
      <section className="container py-24 text-center">
        <Reveal>
          <div className="rounded-3xl border border-neutral-100 bg-neutral-50 py-20 px-6">
            <h2 className="font-serif text-2xl text-neutral-400">Impact contents will be added here.</h2>
            <p className="mt-2 text-neutral-400 font-light text-sm">Let me know what real achievements or impacts you want to showcase!</p>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
