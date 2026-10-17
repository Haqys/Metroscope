import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';

import { JsonLd } from '@/components/marketing/json-ld';
import { ProgramDetail } from '@/components/marketing/program-detail';
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
    }
  );
}

/** Programme article & portfolio case-study detail. */
export default async function ProgramPage({ params }: PageProps) {
  const { slug } = await params;
  const program = await resolveOrLeave(slug);

  return (
    <>
      <JsonLd
        docs={[
          courseJsonLd(program),
          breadcrumbList([
            { name: 'Home', path: '/' },
            { name: 'Programmes', path: '/programs' },
            { name: program.name, path: `/programs/${program.slug}` },
          ]),
        ]}
      />

      <main className="bg-white">
        <div className="container max-w-4xl pt-10 pb-28 lg:pt-16 lg:pb-36">
          <ProgramDetail program={program} />
        </div>
      </main>
    </>
  );
}
