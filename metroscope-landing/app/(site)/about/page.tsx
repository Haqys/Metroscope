import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Target,
  ShieldCheck,
  Compass,
  BookOpen,
  Globe,
  Award,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

import { Reveal } from '@/components/marketing/scroll-fx';
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

const MISSIONS = [
  {
    number: '01',
    icon: BookOpen,
    tag: 'Research & Inquiry',
    title: 'Foster Scientific Literacy',
    desc: 'To foster a culture of research literacy, scientific inquiry, and creative thinking from an early age, encouraging students to view knowledge as a means for social change and global transformation.',
  },
  {
    number: '02',
    icon: Globe,
    tag: 'Mentorship & Arena',
    title: 'Inclusive Global Network',
    desc: 'To establish an inclusive mentorship network that equips innovators with the skills, confidence, and international exposure needed to excel in competitive scientific and technological fields.',
  },
  {
    number: '03',
    icon: Award,
    tag: 'Ethical Leadership',
    title: 'Resilience & Data-Driven Solutions',
    desc: 'To nurture future leaders who are resilient, ethically responsible, and capable of developing data-driven solutions to global challenges through critical thinking and interdisciplinary collaboration.',
  },
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
          <div className="lg:col-span-4 lg:sticky lg:top-28">
            <Reveal>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-maroon uppercase">
                <Compass className="h-3.5 w-3.5" aria-hidden />
                Our Foundations
              </span>
              <h2 className="mt-4 font-serif text-3xl sm:text-4xl font-medium tracking-tight text-neutral-900">
                Vision &amp; Mission
              </h2>
              <p className="mt-4 text-base leading-relaxed font-light text-neutral-500">
                Guiding principles that steer our academic curriculum, mentorship ethos, and commitment to secondary student excellence.
              </p>

              {/* Core Commitments Pill Box */}
              <div className="mt-8 rounded-3xl border border-neutral-200/80 bg-neutral-50/70 p-6 sm:p-7">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-neutral-400 uppercase">
                  <Sparkles className="h-3.5 w-3.5 text-maroon" aria-hidden />
                  Key Commitments
                </div>
                <ul className="mt-4 space-y-3.5 text-sm text-neutral-700 font-light">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-maroon shrink-0 mt-0.5" aria-hidden />
                    <span><strong>Empirical Rigor:</strong> Critical thinking over memorization</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-maroon shrink-0 mt-0.5" aria-hidden />
                    <span><strong>Global Competency:</strong> International symposium readiness</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-maroon shrink-0 mt-0.5" aria-hidden />
                    <span><strong>Ethical Integrity:</strong> Responsible, human-centric innovation</span>
                  </li>
                </ul>
              </div>
            </Reveal>
          </div>

          <div className="lg:col-span-8 space-y-8">
            {/* Vision Banner */}
            <Reveal delay={100}>
              <div className="relative overflow-hidden rounded-3xl border border-neutral-200/90 bg-gradient-to-br from-neutral-50/80 via-white to-neutral-50/50 p-8 sm:p-10 shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-4 mb-6">
                  <span className="text-xs font-semibold tracking-[0.2em] text-maroon uppercase">
                    Our Vision
                  </span>
                  <span className="text-xs font-mono text-neutral-400 tracking-wider">
                    FUTURE IMPACT
                  </span>
                </div>
                <p className="font-serif text-[clamp(1.75rem,3.2vw,2.35rem)] leading-[1.25] font-medium tracking-tight text-neutral-900">
                  To build a generation of young researchers, innovators, and changemakers for society and the world.
                </p>
              </div>
            </Reveal>

            {/* Mission Cards */}
            <Reveal delay={200}>
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                    Our Mission
                  </h3>
                  <span className="text-xs font-mono text-neutral-400">03 PILLARS</span>
                </div>

                <div className="grid gap-4 sm:gap-5">
                  {MISSIONS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <div
                        key={m.number}
                        className="group relative rounded-3xl border border-neutral-200/80 bg-white p-7 sm:p-8 shadow-sm transition-all duration-300 hover:border-maroon/30 hover:shadow-md"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-maroon/10 font-mono text-xs font-semibold text-maroon">
                              {m.number}
                            </span>
                            <h4 className="font-serif text-xl font-medium text-neutral-900 group-hover:text-maroon transition-colors">
                              {m.title}
                            </h4>
                          </div>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-600">
                            <Icon className="h-3 w-3 text-maroon" aria-hidden />
                            {m.tag}
                          </span>
                        </div>
                        <p className="text-base sm:text-lg leading-relaxed font-light text-neutral-600 pl-0 sm:pl-11">
                          {m.desc}
                        </p>
                      </div>
                    );
                  })}
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
                Specifically designed to bridge parental expectations with students&apos; exploration needs.
              </p>
            </div>
          </Reveal>

          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            <Reveal delay={100}>
              <div className="flex h-full flex-col rounded-3xl bg-white p-10 shadow-sm border border-neutral-100">
                <ShieldCheck className="text-maroon h-10 w-10 mb-6" />
                <h3 className="font-serif text-3xl font-medium text-neutral-900">For Parents</h3>
                <p className="mt-4 leading-relaxed font-light text-neutral-500 text-lg">
                  Credibility, program transparency, and real results. You will always have full access to your child&apos;s academic progress, assessment reports, and ongoing curriculum.
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
