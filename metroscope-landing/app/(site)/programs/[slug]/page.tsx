import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';

import { RegistrationForm } from '@/components/forms/registration-form';
import { JsonLd } from '@/components/marketing/json-ld';
import { ProgramDetail } from '@/components/marketing/program-detail';
import { Reveal } from '@/components/marketing/scroll-fx';
import { resolveRedirect } from '@/lib/articles-api';
import { getPublicProgram, type PublicProgramDetail } from '@/lib/programs-api';
import { PUBLISHER, SITE, breadcrumbList, clamp, social } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Rendered per request; the DATA stays tag-cached.
 *
 * Same reason as `/articles/[slug]` (§2.4): Next caches a whole rendered route
 * including a `notFound()` outcome, and once a miss is cached the 301 below
 * never runs again, a renamed programme would serve "not found" forever while
 * `redirects` held a perfectly good redirect. The routing decision must be
 * fresh; the programme itself is still served from the fetch cache and purged
 * by tag on publish.
 */
export const dynamic = 'force-dynamic';

/** Auto-derived, manually overridable, doc 13 §10.7, applied to programmes. */
function seoFor(program: PublicProgramDetail) {
  const url = program.seoCanonical ?? `${SITE}/programs/${program.slug}`;
  const title = clamp(program.seoTitle ?? program.name, 60);
  const description = clamp(
    program.seoDescription ?? program.summary ?? program.description ?? program.name,
    155,
  );
  const image = program.seoOgImageUrl ?? program.coverUrl;
  return { url, title, description, image };
}

/**
 * Resolve the slug once, and decide 200 / 301 / 404 here.
 *
 * `generateMetadata` runs before the page renders, so this is the only place
 * the status can still be changed, §2.4 covers why at length. The page body
 * calls it again purely to get the value; the fetch is deduped within one
 * request, so it costs nothing.
 */
async function resolveOrLeave(slug: string) {
  const program = await getPublicProgram(slug);
  if (program) return program;

  const hit = await resolveRedirect(`/programs/${slug}`);
  if (hit) {
    if (hit.statusCode === 301 || hit.statusCode === 308) permanentRedirect(hit.toPath);
    redirect(hit.toPath);
  }
  notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const program = await resolveOrLeave(slug);
  const { url, title, description, image } = seoFor(program);
  const s = social({ title, description, url, image, imageAlt: program.coverAlt });

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: program.seoNoindex ? { index: false, follow: true } : undefined,
    openGraph: { ...s.openGraph, type: 'website' },
    twitter: s.twitter,
  };
}

/**
 * `Course` JSON-LD, doc 13 §7 lists it among the types this site must emit.
 *
 * `offers` carries the real price from the CMS, so a published price change
 * updates the structured data too. An `Offer` that disagrees with the page is
 * worse than none: it is the number a comparison engine quotes.
 */
function courseJsonLd(program: PublicProgramDetail) {
  const { url, title, description, image } = seoFor(program);

  return (
    program.seoJsonLd ?? {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: title,
      description,
      url,
      image: image ? [image] : undefined,
      inLanguage: program.locale,
      provider: PUBLISHER,
      offers: {
        '@type': 'Offer',
        price: program.priceMonthly,
        priceCurrency: 'IDR',
        category: 'Monthly',
        availability: 'https://schema.org/InStock',
        url,
      },
    }
  );
}

/** Programme detail + inline registration form (wireframe: Ringkasan 2/8). */
export default async function ProgramPage({ params }: PageProps) {
  const { slug } = await params;
  const program = await resolveOrLeave(slug);

  return (
    <>
      <JsonLd
        docs={[
          courseJsonLd(program),
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: 'Program', path: '/programs' },
            { name: program.name, path: `/programs/${program.slug}` },
          ]),
        ]}
      />

      <div className="container grid gap-14 pt-14 pb-28 lg:grid-cols-12 lg:pt-20">
        <div className="lg:col-span-7">
          <Reveal>
            <ProgramDetail program={program} />
          </Reveal>
        </div>

        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <Reveal delay={150}>
              {/*
                The form picks the programme by SLUG, and the picker it renders
                reads the same endpoint this page did, so it can only ever
                offer programmes that exist. Under the fixture the two disagreed
                by construction: the marketing slugs had no rows behind them.
              */}
              <RegistrationForm defaultProgramSlug={program.slug} />
            </Reveal>
          </div>
        </div>
      </div>
    </>
  );
}
