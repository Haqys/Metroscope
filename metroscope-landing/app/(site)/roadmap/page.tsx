import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { BgWord, Reveal, WordReveal } from '@/components/marketing/scroll-fx';
import { absolute } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Roadmap & Services | Metroscope',
  description: 'Learning flow for Grades 7-9 and execution preparation services for top high schools.',
  alternates: { canonical: absolute('/roadmap') },
};

const ROADMAP = [
  {
    step: 'Grade 7',
    title: 'Discovery & Mapping',
    body: 'Starting from IQ tests, psychological assessments, to mapping interests and talents to create a personalized learning map for students during junior high.',
  },
  {
    step: 'Grade 8',
    title: 'Portfolio Building & Competition',
    body: 'Focus on gathering portfolios through 2 main competition tracks: Research Competitions (science/social) and Business Competitions.',
  },
  {
    step: 'Grade 9',
    title: 'Acceleration & Selection',
    body: 'Intensive preparation for Academic Potential Tests (TKA), clearing administrative files, test simulations, and executing the target of entering 50 top high schools (in and outside Metro) + scholarship paths.',
  },
];

export default function RoadmapPage() {
  return (
    <main className="bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-14 lg:py-24">
        <BgWord word="Roadmap" className="text-maroon" />
        <div className="relative container text-center">
          <Reveal>
            <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
              Mentoring Roadmap
            </p>
          </Reveal>
          <h1 className="mx-auto mt-8 max-w-4xl font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.1] font-medium tracking-tight text-neutral-900">
            <WordReveal text="Structured steps to your dream high school." />
          </h1>
          <Reveal delay={200}>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed font-light text-neutral-500">
              From mapping potential in Grade 7 to executing enrollment in Grade 9, we accompany every step to make the dream of entering a top high school a reality.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Journey Section (Sticky Scroll Animation) */}
      <section className="container pb-32 pt-10">
        <div className="grid gap-14 lg:grid-cols-12">
          {/* Scrollable Steps */}
          <div className="order-last lg:order-first lg:col-span-6">
            {ROADMAP.map((item) => (
              <div key={item.step} className="flex min-h-[60vh] items-center py-10">
                <Reveal className="border-l-2 border-maroon/20 pl-8 lg:pl-12">
                  <p className="text-maroon/30 font-serif text-5xl leading-none italic sm:text-6xl">
                    {item.step}
                  </p>
                  <h3 className="mt-8 font-serif text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">
                    {item.title}
                  </h3>
                  <p className="mt-6 max-w-md text-lg leading-relaxed font-light text-neutral-600">
                    {item.body}
                  </p>
                </Reveal>
              </div>
            ))}
          </div>

          {/* Sticky Image Right */}
          <div className="lg:col-span-6">
            <div className="lg:sticky lg:top-32">
              <Reveal>
                <div className="relative mt-10 aspect-[4/5] w-full overflow-hidden rounded-3xl bg-neutral-100 shadow-xl lg:mt-0 lg:h-[calc(100vh-18rem)]">
                  <Image
                    src="https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&auto=format&fit=crop&q=60"
                    alt="Metroscope student mentoring roadmap"
                    fill
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[20s] hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-10 left-10 text-white">
                    <p className="font-serif text-2xl font-medium">Directed Mentoring</p>
                    <p className="text-white/80 font-light">Middle School → Top High School</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="container pb-32">
        <Reveal>
          <div className="bg-navy relative overflow-hidden rounded-3xl px-6 py-20 text-center sm:px-12 lg:py-24">
            <div className="relative z-10">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-white sm:text-5xl">
                Ready to map your potential?
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed font-light text-white/70">
                Take the first step with a free IQ test and aptitude assessment with our team.
              </p>
              <div className="mt-10">
                <Link
                  href="/register"
                  className="bg-maroon hover:bg-maroon-dark inline-block rounded-full px-10 py-4 text-sm font-medium tracking-wide text-white shadow-lg transition-transform hover:scale-105"
                >
                  Register for Assessment Now
                </Link>
              </div>
            </div>
            {/* Subtle background glow */}
            <div className="bg-maroon/20 absolute -top-24 -right-24 h-96 w-96 rounded-full blur-[100px]" />
          </div>
        </Reveal>
      </section>
    </main>
  );
}