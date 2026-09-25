import type { Metadata } from 'next';

import { ProgramCard } from '@/components/marketing/program-card';
import { EmptyState } from '@/components/ui/states';
import { Reveal } from '@/components/marketing/scroll-fx';
import { listPublicPrograms } from '@/lib/programs-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION = 'Program bimbingan lomba Metroscope untuk siswa SD, SMP, dan SMA.';
const URL = absolute('/programs');
const SOCIAL = social({ title: 'Program · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Program',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * The programme index, from the CMS (doc 14 §2.5).
 *
 * Every card, name, category, copy, cover, comes from `/v1/public/programs`.
 * The fixture that used to back this page is deleted, so marketing can add a
 * programme or change a price and see it here after publishing, with no deploy.
 */
export default async function ProgramsPage() {
  const programs = await listPublicPrograms();

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <Reveal>
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Program</p>
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.75rem,7vw,6rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
          Pilih Panggung Lombamu.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          Jalur pembinaan dengan mentor spesialis di bidangnya, konsultasi awal selalu gratis.
        </p>
      </Reveal>

      {programs.length === 0 ? (
        <div className="mt-16">
          {/*
            An honest empty state rather than a hardcoded fallback. If this
            renders in production, the CMS has nothing published, which is a
            fact somebody needs to see, not one to paper over with the three
            programmes that used to be compiled into the bundle.
          */}
          <EmptyState
            title="Program belum tersedia"
            description="Hubungi kami untuk konsultasi. Kami bantu petakan lomba yang cocok."
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
  );
}
