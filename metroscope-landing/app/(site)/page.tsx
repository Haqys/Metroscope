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

const TITLE = 'Metroscope. Olympiad & Competition Mentoring';
const DESCRIPTION =
  'Competition mentoring for elementary to high school students: olympiads, debates, and scientific papers. Specialist mentors, tracked progress, free initial consultation.';

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
  { to: 128, suffix: '+', label: 'Active Students Mentored' },
  { to: 40, suffix: '+', label: 'Championship Titles & Finalists' },
  { to: 3, suffix: '', label: 'Flagship Programmes' },
  { to: 4.8, suffix: '/5', decimals: 1, label: 'Mentor Rating' },
];

const JOURNEY = [
  {
    step: '01',
    title: 'Free Consultation',
    body: 'Talk with our team to determine the right program & schedule. No commitment, confirmation via email within 24 hours.',
  },
  {
    step: '02',
    title: 'Routine & Measured Lessons',
    body: 'Twice a week with a dedicated mentor. Schedules automatically sync to Google Calendar, progress recorded per topic.',
  },
  {
    step: '03',
    title: 'Intensive Competition Prep',
    body: 'Approaching the D-Day, practice is focused on the target competition\'s syllabus, readiness monitored by parents from the portal.',
  },
  {
    step: '04',
    title: 'Assessment & Level Up',
    body: 'Every month, mentors provide structured assessments. Points, badges, and levels keep the learning momentum alive.',
  },
];

/** Three latest achievement stories on the homepage. */

/* Real testimonials from parents. */
const TESTIMONIALS = [
  {
    quote:
      'Congratulations to all the good and smart children, your hard work has borne fruit. And be grateful that your parents provide these facilities, as many out there do not get the same opportunity... Congratulations and success! This outcome is truly a reflection of who accompanies them; thank you, Kak Balqis. We are proud that Fara has the right circle.',
    name: 'Ayah Fara (SCA)',
  },
  {
    quote:
      'Alhamdulillah... Congratulations to Kak Balqis and the team. May this serve as even greater motivation for future successes! Praise be to Allah. Wishing everyone a wonderful holiday! Thank you so much to Kak Balqis, Kak Jessica, and Kak Aravinda for guiding the children so patiently, accompanying them, and providing motivation and enlightenment so they grow into better, broad-minded individuals. May success always surround us all, aamiin.',
    name: 'Parent (+62 813-6932-6209)',
  },
  {
    quote:
      'Alhamdulillah, thanks to Kak Balqis and the other mentors, great leaders, great teams, great result! Congratulations! Amen, thank you Metroscope mentor kakas, may Metroscope continue to thrive forever.',
    name: 'Bunda Raffa',
  },
  {
    quote:
      'Congratulations to all the kids, the process never betrays the results... Thank you, Kak Bilqis!',
    name: 'Bunda Abhie',
  },
  {
    quote:
      "Alhamdulillah, congratulations on the children's achievements and thank you very much to the mentors.",
    name: 'Ayah Vindy',
  },
  {
    quote:
      'Alhamdulillah, the series of competition activities went smoothly and successfully. Congratulations to our creative and high-achieving children! Thank you to the mentor Kak Balqis, Kak Jesica, and Kak Ara for guiding and accompanying the kids through the competition until they returned safely to their respective homes. Thank you also to all the parents for the cooperation.',
    name: 'Bunda Meera',
  },
  {
    quote:
      "Assalamu'alaikum. Thank you, Kak Balqis and team, for your extraordinary dedication in accompanying the children from the start until they returned home with satisfying results. Thank you also to all the mothers (Mama Vindi, Mama Fara, Mama Ameera, Mama Abi, Mama Raffa) for your support, cooperation, and help. May all your kindness be counted as worship and bring future blessings to the children. I also apologize to Kak Balqis and the mothers for my fussiness in the group. Once again, sincere apologies and thank you to everyone. May our bonds of friendship always be preserved. Success to Kak Balqis and the kids... aamiin ya rabbal 'alamin.",
    name: 'Bunda Gisel (Metroscope)',
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
          <BgWord word="Achievement" className="text-maroon" />
          <div className="relative container">
            <Reveal>
              <p className="text-maroon text-center text-xs font-medium tracking-[0.35em] uppercase">
                Metroscope
              </p>
            </Reveal>
            <h2 className="mx-auto mt-8 max-w-4xl text-center font-serif text-[clamp(2rem,4.5vw,3.75rem)] leading-[1.2] font-medium tracking-tight text-neutral-900">
              <WordReveal text="Every child has champion potential. Our job is to prepare the stage, curriculum per topic, experienced mentors, and guidance until the D-day." />
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
                    Programmes
                  </p>
                  <h2 className="mt-5 font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
                    Choose Your Stage.
                  </h2>
                  <p className="mt-6 max-w-sm leading-relaxed font-light text-neutral-500">
                    Three mentoring tracks for elementary, junior, and senior high school students, each with specialist mentors in their fields.
                  </p>
                  <Link
                    href="/programs"
                    className="hover:border-maroon hover:text-maroon mt-8 inline-block rounded-full border border-neutral-300 px-7 py-3.5 text-sm font-medium text-neutral-900 transition-colors"
                  >
                    All Programmes
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
          <BgWord word="Champion" className="text-white" />
          <div className="relative container">
            <Reveal>
              <p className="text-xs font-medium tracking-[0.35em] text-white/60 uppercase">
                Real Impact
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
                    Student Journey
                  </p>
                  <div className="relative mt-6 aspect-[4/5] overflow-hidden rounded-3xl lg:h-[calc(100vh-14rem)] lg:w-full">
                    <Image
                      src={IMG.classroom}
                      alt="Metroscope mentoring classroom atmosphere"
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
                  Articles
                </p>
                <h2 className="mt-5 font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
                  Student Achievement Traces.
                </h2>
              </div>
              <Link
                href="/articles"
                className="bg-navy hover:bg-navy-dark mb-2 rounded-full px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-colors"
              >
                View All Articles →
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
                Testimonials
              </p>
              <h2 className="mx-auto mt-5 max-w-2xl text-center font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
                Words from Parents &amp; Students.
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
              alt="Metroscope students celebrating a competition victory"
              fill
              sizes="100vw"
              className="object-cover"
            />
          </Parallax>
          <div className="absolute inset-0 bg-black/25" aria-hidden />
          <p className="absolute bottom-10 left-1/2 w-full -translate-x-1/2 px-6 text-center text-xs font-medium tracking-[0.35em] text-white/80 uppercase">
            OSN City Podium. Batch 2026
          </p>
        </section>

        {/*,,, Closing CTA,,, */}
        <section className="relative overflow-hidden py-36 lg:py-48">
          <BgWord word="Start" className="text-maroon" />
          <div className="relative container text-center">
            <h2 className="mx-auto max-w-3xl font-serif text-[clamp(2.75rem,7vw,6rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
              <WordReveal text="Initial" />{' '}
              <WordReveal text="assessment." startDelay={250} className="text-maroon italic" />
            </h2>
            <Reveal delay={400}>
              <p className="mx-auto mt-8 max-w-md text-lg leading-relaxed font-light text-neutral-500">
                Start your journey with a comprehensive IQ test and aptitude assessment. Our team will contact you within 24 hours.
              </p>
            </Reveal>
            <Reveal delay={550}>
              <div className="mt-12 flex justify-center gap-5">
                <Link
                  href="/register"
                  className="bg-maroon hover:bg-maroon-dark rounded-full px-10 py-4 text-sm font-medium tracking-wide text-white transition-all duration-300 hover:scale-[1.03]"
                >
                  Register for Assessment
                </Link>
                <Link
                  href="/programs"
                  className="border-navy text-navy hover:bg-navy rounded-full border px-10 py-4 text-sm font-medium tracking-wide transition-colors hover:text-white"
                >
                  View Programmes
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </>
  );
}
