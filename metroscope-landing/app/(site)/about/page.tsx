import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Target, Users, ShieldCheck } from 'lucide-react';

import { Reveal, WordReveal } from '@/components/marketing/scroll-fx';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION =
  'Metroscope is a strategic mentoring ecosystem and integrated selection preparation for junior high school students in Metro, Lampung.';
const URL = absolute('/about');
const SOCIAL = social({ title: 'About Us · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'About Us',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

const STATS = [
  { value: '128+', label: 'Active Students' },
  { value: '50', label: 'Top High School Targets' },
  { value: '9', label: 'Expert Mentors' },
  { value: '100%', label: 'Transparency' },
];

export default function AboutPage() {
  return (
    <main className="bg-white">
      {/* Hero / Definisi */}
      <section className="container pt-14 pb-20 lg:pt-24">
        <Reveal>
          <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
            About Us
          </p>
          <h1 className="mt-5 max-w-5xl font-serif text-[clamp(2.5rem,6vw,5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
            Strategic mentoring ecosystem and integrated selection preparation for{' '}
            <span className="text-maroon italic">junior high students in Metro, Lampung.</span>
          </h1>
        </Reveal>
      </section>

      {/* Vision & Mission */}
      <section className="container py-24 border-t border-neutral-100">
        <div className="grid gap-16 lg:grid-cols-12 items-start">
          <div className="lg:col-span-4">
            <Reveal>
              <h2 className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
                Purpose
              </h2>
              <h3 className="mt-4 font-serif text-4xl font-medium tracking-tight text-neutral-900">
                Vision & Mission
              </h3>
            </Reveal>
          </div>

          <div className="lg:col-span-8 space-y-16">
            <Reveal delay={100}>
              <div className="border-b border-neutral-200 pb-12">
                <h4 className="text-sm font-semibold tracking-wider text-neutral-400 uppercase mb-6">Our Vision</h4>
                <p className="font-serif text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.2] font-medium tracking-tight text-neutral-900">
                  To build a generation of young researchers, innovators, and changemakers for society and the world.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div>
                <h4 className="text-sm font-semibold tracking-wider text-neutral-400 uppercase mb-8">Our Mission</h4>
                <div className="grid gap-8">
                  <div className="flex gap-6 group">
                    <span className="text-maroon font-serif text-3xl font-medium opacity-50 group-hover:opacity-100 transition-opacity">01</span>
                    <p className="text-lg leading-relaxed font-light text-neutral-600">
                      To foster a culture of research literacy, scientific inquiry, and creative thinking from an early age, encouraging students to view knowledge as a means for social change and global transformation.
                    </p>
                  </div>
                  <div className="flex gap-6 group">
                    <span className="text-maroon font-serif text-3xl font-medium opacity-50 group-hover:opacity-100 transition-opacity">02</span>
                    <p className="text-lg leading-relaxed font-light text-neutral-600">
                      To establish an inclusive mentorship network that equips innovators with the skills, confidence, and international exposure needed to excel in competitive scientific and technological fields.
                    </p>
                  </div>
                  <div className="flex gap-6 group">
                    <span className="text-maroon font-serif text-3xl font-medium opacity-50 group-hover:opacity-100 transition-opacity">03</span>
                    <p className="text-lg leading-relaxed font-light text-neutral-600">
                      To nurture future leaders who are resilient, ethically responsible, and capable of developing data-driven solutions to global challenges through critical thinking and interdisciplinary collaboration.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>



      {/* Target Audiens Ganda */}
      <section className="bg-navy-light/40 py-24">
        <div className="container">
          <Reveal>
            <div className="text-center">
              <h2 className="mx-auto max-w-2xl font-serif text-[clamp(2rem,5vw,3.5rem)] font-medium tracking-tight text-neutral-900">
                Our Dual Approach.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg font-light text-neutral-500">
                Specifically designed to bridge parental expectations with students' exploration needs.
              </p>
            </div>
          </Reveal>

          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            <Reveal delay={100}>
              <div className="flex h-full flex-col rounded-3xl bg-white p-10 shadow-sm border border-neutral-100">
                <ShieldCheck className="text-maroon h-10 w-10 mb-6" />
                <h3 className="font-serif text-3xl font-medium text-neutral-900">For Parents</h3>
                <p className="mt-4 leading-relaxed font-light text-neutral-500 text-lg">
                  Credibility, program transparency, and real results. You will always have full access to your child's academic progress, assessment reports, and ongoing curriculum.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="flex h-full flex-col rounded-3xl bg-white p-10 shadow-sm border border-neutral-100">
                <Target className="text-maroon h-10 w-10 mb-6" />
                <h3 className="font-serif text-3xl font-medium text-neutral-900">For Students</h3>
                <p className="mt-4 leading-relaxed font-light text-neutral-500 text-lg">
                  An interactive, modern, and youthful mentoring experience. We eliminate the rigid impression of conventional tutoring, replacing it with a point system, rewards, and a supportive community.
                </p>
              </div>
            </Reveal>
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
              <p className="mt-3 text-sm tracking-widest text-neutral-400 uppercase">
                {stat.label}
              </p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={300}>
          <div className="mt-20">
            <h2 className="font-serif text-3xl font-medium text-neutral-900 mb-6">Take your first step</h2>
            <Link
              href="/register"
              className="bg-maroon hover:bg-maroon-dark inline-block rounded-full px-10 py-4 text-sm font-medium tracking-wide text-white transition-all duration-300 hover:scale-105 shadow-lg"
            >
              Free Consultation & Assessment
            </Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
