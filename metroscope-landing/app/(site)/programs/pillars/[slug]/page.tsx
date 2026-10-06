import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

import { PILLARS } from '@/lib/pillars-data';
import { listPublicPrograms } from '@/lib/programs-api';
import { ProgramCard } from '@/components/marketing/program-card';
import { Reveal } from '@/components/marketing/scroll-fx';
import { absolute } from '@/lib/seo';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pillar = PILLARS.find((p) => p.slug === slug);
  if (!pillar) return {};

  return {
    title: `${pillar.title} Programmes`,
    description: pillar.body,
    alternates: { canonical: absolute(`/programs/pillars/${slug}`) },
  };
}

export function generateStaticParams() {
  return PILLARS.map((p) => ({ slug: p.slug }));
}

export default async function PillarPage({ params }: Props) {
  const { slug } = await params;
  const pillar = PILLARS.find((p) => p.slug === slug);
  if (!pillar) notFound();

  // For demonstration, we'll just show all programs or a subset.
  const programs = await listPublicPrograms();

  return (
    <main className="bg-white">
      {/* Spacer to account for fixed navbar */}
      <div className="h-20" aria-hidden />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-neutral-50 py-16 lg:py-24 border-b border-neutral-100">
        <div className="container relative z-10 grid gap-12 lg:grid-cols-2 items-center">
          <Reveal className="relative z-20">
            <h1 className="font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.1] font-medium tracking-tight text-neutral-900 pr-4 lg:pr-8">
              {pillar.title}
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed font-light text-neutral-600">
              {pillar.body}
            </p>
          </Reveal>
          <Reveal delay={200} className="hidden lg:block relative h-[400px]">
            {/* Placeholder hero image for the pillar */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[100%] h-full rounded-[2rem] overflow-hidden shadow-2xl">
              <Image
                src="https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&auto=format&fit=crop&q=80"
                alt={pillar.title}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-maroon/10 mix-blend-multiply" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Content Section */}
      <section className="container py-20 lg:py-32">
        <div className="grid gap-16 lg:grid-cols-12 items-start">
          
          {/* Sidebar */}
          <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-32">
            <Reveal>
              <h3 className="text-sm font-semibold tracking-wider text-neutral-900 mb-6 uppercase">
                Explore More Programmes:
              </h3>
              <nav className="flex flex-col gap-3">
                {PILLARS.map((p) => {
                  const isActive = p.slug === slug;
                  return (
                    <Link
                      key={p.slug}
                      href={`/programs/pillars/${p.slug}`}
                      className={`block px-6 py-4 rounded-xl border transition-all duration-300 font-medium ${
                        isActive 
                          ? 'bg-maroon text-white border-maroon shadow-md' 
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-maroon/50 hover:bg-maroon/5 hover:text-maroon'
                      }`}
                    >
                      {p.title}
                    </Link>
                  );
                })}
              </nav>
            </Reveal>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-8 xl:col-span-9">
            <Reveal>
              <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
                What We Do
              </p>
              <h2 className="mt-4 font-serif text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">
                {pillar.title} Programmes
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-8 sm:grid-cols-2">
              {programs.length > 0 ? (
                programs.map((program, i) => (
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
                ))
              ) : (
                <div className="col-span-2 py-10">
                  <p className="text-neutral-500 font-light">
                    More specific programmes will be added here soon.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}
