import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  Compass,
  GraduationCap,
  Sparkles,
  Award,
  BookOpen,
  Microscope,
  Camera,
  Users,
} from 'lucide-react';

import {
  formatDuration,
  formatLevels,
  categoryLabel,
  type PublicProgramDetail,
} from '@/lib/programs-api';

interface Competency {
  title: string;
  desc: string;
}

export const COMPETENCIES_BY_CATEGORY: Record<string, Competency[]> = {
  ACADEMIC: [
    {
      title: 'Deep Conceptual Understanding',
      desc: 'Not memorizing patterns or quick shortcuts; developing intuition from theoretical first principles.',
    },
    {
      title: 'Non-Routine Problem Decomposition',
      desc: 'Training the ability to dissect advanced olympiad problems using 2–3 creative alternative methodologies.',
    },
    {
      title: '1-on-1 Competency Mapping',
      desc: 'Transparent progress tracking per topic to diagnose specific understanding gaps for each student.',
    },
    {
      title: 'Competitive Mental Resilience',
      desc: 'Simulating authentic competition environments with strict time constraints to cultivate stamina under pressure.',
    },
  ],
  NON_ACADEMIC: [
    {
      title: 'AREL Logical Framework',
      desc: 'Assertion, Reasoning, Evidence, and Linkback systematically structured to withstand rigorous questioning.',
    },
    {
      title: 'Global Contemporary Issues Research',
      desc: 'Dissecting geopolitics, circular economy, artificial intelligence, and real-world public policy.',
    },
    {
      title: 'Rhetoric & Stage Poise',
      desc: 'Transforming public speaking anxiety into confident, composed, and substantive articulation.',
    },
    {
      title: 'Evidence-Based Leadership',
      desc: 'Shaping a young generation that is not merely vocal, but always speaks on the basis of evidence and empathy.',
    },
  ],
  CREATIVE: [
    {
      title: 'Idea Formulation & Novelty Testing',
      desc: 'Identifying sharp, directed, and realistic research novelty achievable at the school level.',
    },
    {
      title: 'Applied Scientific Methodology',
      desc: 'Formulating measurable experimental designs, field surveys, and scientifically ethical data processing.',
    },
    {
      title: 'Standard Scientific Journal Writing',
      desc: 'Composing academic manuscripts with formal systematics: concise abstracts, literature reviews, and graphic data visualizations.',
    },
    {
      title: 'Defense Mastery & Jury Q&A',
      desc: 'Presentation coaching and strategies for calmly and rigorously addressing critical questions from judges using data.',
    },
  ],
};

const SECTION_HEADINGS = new Set([
  'Fostering a Culture of Scientific Inquiry',
  'From National Selection to the International Stage',
  'Key Contributions and Research Highlights',
  'Empowering Young Scholars Through Global Academic Engagement',
  'An Integrated Hybrid Academic Itinerary',
  'Research Contributions and Scientific Focus',
  'Event Documentation',
  'Empowering Young Innovators Through Applied Science',
  'An Integrated Hybrid Competition Framework',
]);

/**
 * Editorial Article / Event Detail view of a Metroscope participation & delegation.
 */
export function ProgramDetail({ program }: { program: PublicProgramDetail }) {
  const competencies =
    COMPETENCIES_BY_CATEGORY[program.category] ?? COMPETENCIES_BY_CATEGORY.CREATIVE;
  // Split body paragraphs
  const paragraphs = (program.body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const isEvent = Boolean(program.dateVenue || program.delegationStats || program.headline);

  return (
    <article className="w-full">
      {/* ── Breadcrumb & Category Badge ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 pb-6">
        <nav aria-label="Breadcrumbs" className="flex items-center gap-2 text-sm text-neutral-400">
          <Link
            href="/programs"
            className="hover:text-maroon inline-flex items-center gap-1.5 font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All Events & Portfolios
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-neutral-600 font-normal">
            {isEvent ? 'Events' : categoryLabel(program.category)}
          </span>
        </nav>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-maroon uppercase">
          <Compass className="h-3.5 w-3.5" aria-hidden />
          {categoryLabel(program.category)}
        </span>
      </div>

      {/* ── Header: Title & Headline ────────────────────────────────────── */}
      <header className="mt-8">
        <p className="text-maroon text-xs font-semibold tracking-[0.25em] uppercase">
          {program.articleType ?? 'News & Research Feature Article'}
        </p>

        <h1 className="mt-3 font-serif text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.08] font-medium tracking-tight text-neutral-900">
          {program.name}
        </h1>

        {program.headline && (
          <h2 className="mt-4 text-xl sm:text-2xl font-serif leading-snug font-normal text-neutral-700 max-w-3xl">
            {program.headline}
          </h2>
        )}

        {/* Editorial Byline & Date/Venue */}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-neutral-100 pt-6 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-maroon" />
            <span className="font-medium text-neutral-800">
              Metroscope Delegation & Academic Board
            </span>
          </div>

          {program.dateVenue && (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5 text-neutral-700 font-medium">
                <Calendar className="h-3.5 w-3.5 text-maroon" />
                {program.dateVenue.includes('|')
                  ? program.dateVenue.split('|')[0].trim()
                  : program.dateVenue}
              </span>
              {program.dateVenue.includes('|') && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5 text-neutral-600">
                    <MapPin className="h-3.5 w-3.5 text-maroon" />
                    {program.dateVenue.split('|')[1].trim()}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {/* ── Quick Facts & Delegation Specifications ────────────────────── */}
      {program.delegationStats && program.delegationStats.length > 0 ? (
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-3xl border border-neutral-200/80 bg-neutral-50/70 p-6 sm:p-8">
          {program.delegationStats.map((stat, idx) => {
            const icons = [Users, Award, Microscope, Sparkles];
            const StatIcon = icons[idx % icons.length];
            return (
              <div key={stat.label}>
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                  <StatIcon className="h-3.5 w-3.5 text-maroon" aria-hidden />
                  {stat.label}
                </dt>
                <dd className="mt-2 text-base font-medium text-neutral-900">{stat.value}</dd>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-3xl border border-neutral-200/80 bg-neutral-50/70 p-6 sm:p-8">
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
              <GraduationCap className="h-3.5 w-3.5 text-maroon" aria-hidden />
              Student Level
            </dt>
            <dd className="mt-2 text-base font-medium text-neutral-900">
              {formatLevels(program.levels)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
              <Calendar className="h-3.5 w-3.5 text-maroon" aria-hidden />
              Program Cycle
            </dt>
            <dd className="mt-2 text-base font-medium text-neutral-900">
              {formatDuration(program.durationMonths)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
              <Clock className="h-3.5 w-3.5 text-maroon" aria-hidden />
              Session Intensity
            </dt>
            <dd className="mt-2 text-base font-medium text-neutral-900">
              {program.cadence ?? 'Scheduled'}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
              <Sparkles className="h-3.5 w-3.5 text-maroon" aria-hidden />
              Focus
            </dt>
            <dd className="mt-2 text-base font-medium text-neutral-900">
              Research & Innovation
            </dd>
          </div>
        </div>
      )}

      {/* ── Cover Image ─────────────────────────────────────────────────── */}
      {program.coverUrl && (
        <figure className="mt-10">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl bg-neutral-100 shadow-lg shadow-neutral-200/50">
            <Image
              src={program.coverUrl}
              alt={program.coverAlt ?? program.name}
              fill
              sizes="(min-width: 1024px) 56rem, 100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
          </div>
          <figcaption className="mt-3 text-center text-xs text-neutral-400 font-light">
            {program.coverAlt ?? 'Documentation of Metroscope delegation participation and contribution.'}
          </figcaption>
        </figure>
      )}

      {/* ── Research Highlights Section ─────────────────────────────────── */}
      {program.researchHighlights && program.researchHighlights.length > 0 && (
        <section className="mt-16">
          <div className="flex items-center gap-3">
            <Microscope className="h-5 w-5 text-maroon" aria-hidden />
            <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
              Research Highlights & Scientific Contributions
            </h2>
          </div>
          <p className="mt-2 text-sm text-neutral-500 font-light">
            Innovative research projects designed, tested, and defended by student delegates on the
            international stage.
          </p>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {program.researchHighlights.map((hl, idx) => (
              <div
                key={hl.title}
                className="flex flex-col justify-between rounded-3xl border border-neutral-200/80 bg-white p-7 shadow-sm transition-all hover:border-maroon/30 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-maroon/10 text-xs font-semibold text-maroon">
                      0{idx + 1}
                    </span>
                    {hl.tag && (
                      <span className="rounded-full bg-neutral-100 px-3 py-0.5 text-[11px] font-medium text-neutral-600">
                        {hl.tag}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 font-serif text-xl font-medium text-neutral-900 leading-snug">
                    {hl.title}
                  </h3>
                  {hl.subtitle && (
                    <p className="mt-1.5 text-xs font-medium text-maroon italic">{hl.subtitle}</p>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600 font-light">
                    {hl.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Itinerary & Competition Stages ──────────────────────────────── */}
      {program.itineraryPhases && program.itineraryPhases.length > 0 && (
        <section className="mt-16 border-t border-neutral-100 pt-12">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-maroon" aria-hidden />
            <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
              Stages & Symposium Execution Timeline
            </h2>
          </div>
          <p className="mt-2 text-sm text-neutral-500 font-light">
            The progressive journey of delegates navigating the selection process, hybrid judging
            sessions, through to the award ceremonies.
          </p>

          <div className="mt-6 space-y-4">
            {program.itineraryPhases.map((phase) => (
              <div
                key={phase.phase}
                className="flex flex-col sm:flex-row sm:items-start gap-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/60 p-6 transition-all hover:bg-neutral-50"
              >
                <div className="sm:w-48 shrink-0">
                  <span className="inline-block rounded-full bg-maroon/10 px-3 py-0.5 text-xs font-semibold text-maroon uppercase">
                    {phase.phase}
                  </span>
                  <p className="mt-2 text-xs font-medium text-neutral-500">{phase.period}</p>
                </div>
                <div className="flex-1">
                  <h4 className="font-serif text-lg font-medium text-neutral-900">
                    {phase.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 font-light">
                    {phase.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Article Body Narrative ──────────────────────────────────────── */}
      <section className="mt-16 border-t border-neutral-100 pt-12">
        <div className="prose prose-neutral max-w-none">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="h-5 w-5 text-maroon" aria-hidden />
            <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900 m-0">
              Full Coverage & Academic Narrative
            </h2>
          </div>

          <div className="space-y-6 text-neutral-700 leading-[1.85] text-lg font-light">
            {paragraphs.map((para, i) => {
              // Section Heading check
              if (SECTION_HEADINGS.has(para)) {
                return (
                  <div key={i} className="pt-6 pb-2 border-t border-neutral-100 mt-8">
                    <h3 className="font-serif text-2xl font-medium tracking-tight text-neutral-900 m-0">
                      {para}
                    </h3>
                  </div>
                );
              }

              // Highlight lead paragraph
              if (
                para.startsWith('Cyberjaya, Malaysia') ||
                para.startsWith('Jakarta, Indonesia') ||
                para.startsWith('Yogyakarta, Indonesia')
              ) {
                const parts = para.split('—');
                const location = parts[0];
                const rest = parts.slice(1).join('—');
                return (
                  <p key={i} className="text-xl leading-relaxed text-neutral-800 font-normal">
                    <span className="font-semibold text-neutral-900 uppercase text-base tracking-wider text-maroon">
                      {location} —
                    </span>{' '}
                    {rest}
                  </p>
                );
              }

              // Key sub-sections with colons
              if (
                para.startsWith('IoT-Based Environmental Monitoring:') ||
                para.startsWith('Biomedical Research on Natural Antibacterial Agents:')
              ) {
                const parts = para.split(':');
                const title = parts[0];
                const rest = parts.slice(1).join(':');
                return (
                  <div
                    key={i}
                    className="my-5 rounded-2xl border-l-4 border-maroon bg-neutral-50/80 p-5 pl-6"
                  >
                    <h4 className="font-serif font-medium text-neutral-900 text-lg mb-1">
                      {title}
                    </h4>
                    <p className="text-neutral-600 text-base leading-relaxed m-0 font-light">
                      {rest}
                    </p>
                  </div>
                );
              }

              return (
                <p key={i} className="text-neutral-700">
                  {para}
                </p>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Documentary Gallery (JISF & Events) ─────────────────────────── */}
      {program.gallery && program.gallery.length > 0 && (
        <section className="mt-16 border-t border-neutral-100 pt-12">
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5 text-maroon" aria-hidden />
            <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
              Event Documentation & Symposium Gallery
            </h2>
          </div>
          <p className="mt-2 text-sm text-neutral-500 font-light">
            Visual records of live evaluations, oral defense sessions before the jury, and
            scientific activities of the delegation.
          </p>

          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {program.gallery.map((item, idx) => (
              <div
                key={idx}
                className="group overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm transition-all hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                  <Image
                    src={item.url}
                    alt={item.alt}
                    fill
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-neutral-900 leading-snug">{item.alt}</p>
                  <p className="mt-1 text-[11px] text-neutral-500 font-light leading-relaxed">
                    {item.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Callout: Join Delegations / Curriculum Discussion ───────────── */}
      <section className="mt-20 overflow-hidden rounded-3xl border border-neutral-200/80 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 p-8 sm:p-12 text-white">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-medium tracking-wider text-neutral-200 uppercase backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-maroon-light" />
            Achievement Incubation & International Delegation
          </span>

          <h2 className="mt-6 font-serif text-3xl sm:text-4xl font-medium tracking-tight text-white leading-tight">
            Looking to Guide Students to the International Scientific Stage?
          </h2>

          <p className="mt-4 text-neutral-300 font-light leading-relaxed text-base sm:text-lg">
            Metroscope welcomes collaboration in scientific paper mentoring, applied research, and
            international competition preparation for students and schools across Indonesia and
            beyond.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-2xl bg-maroon px-6 py-3.5 text-sm font-medium text-white shadow-md transition-all hover:bg-maroon-dark hover:shadow-lg"
            >
              Consult Delegation Programs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <Link
              href="/programs"
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/10"
            >
              View Other Events & Portfolios
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
