import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { TestimonialQuote } from '@/components/marketing/testimonial-quote';
import { JsonLd } from '@/components/marketing/json-ld';
import { EmptyState } from '@/components/ui/states';
import { Reveal } from '@/components/marketing/scroll-fx';
import { listTestimonials, type Testimonial } from '@/lib/surfaces-api';
import { ORGANIZATION } from '@/lib/organization';
import { SITE, absolute, breadcrumbList, social } from '@/lib/seo';

const TITLE = 'Testimoni';
const DESCRIPTION =
  'Cerita orang tua dan siswa Metroscope, dari ragu di awal sampai naik podium lomba.';
const URL = absolute('/testimonials');

const SOCIAL = social({ title: `${TITLE} · Metroscope`, description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * `Review`, doc 13 §5.2 lists it among the types this site must emit.
 *
 * Three things this deliberately does NOT do:
 *
 * **No `reviewRating`.** Nobody has ever collected a rating. `testimonials` has
 * a quote, an author and a consent record, and no score anywhere, so a
 * `"ratingValue": 5` here would be a number invented by this file and published
 * to Google as the parent's opinion. The homepage's "4.8/5" is a literal in the
 * source for the same reason it is not here.
 *
 * **No `aggregateRating`** on the organisation, for the same reason and one
 * more: it is the field that turns stars into a search result, which is exactly
 * why it is the one worth being scrupulous about.
 *
 * **Real rows only.** The homepage still renders a hardcoded testimonial array
 * (its block migration is deferred); nothing from it appears here. Every review
 * below is a row an editor published, and the pipeline refused to publish it
 * without a recorded consent source.
 *
 * Google does not show rich results for reviews of a business by that business,
 * "self-serving reviews" are ineligible, and this markup does not pretend
 * otherwise. It is emitted because it is true and machine-readable, which is
 * what structured data is for; the rich result was never the point.
 */
function reviewsJsonLd(testimonials: Testimonial[]) {
  if (testimonials.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: testimonials.map((testimonial, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Review',
        reviewBody: testimonial.quote,
        author: { '@type': 'Person', name: testimonial.authorName },
        ...(testimonial.publishedAt ? { datePublished: testimonial.publishedAt } : {}),
        itemReviewed: {
          '@type': 'EducationalOrganization',
          '@id': `${SITE}/#organization`,
          name: ORGANIZATION.name,
        },
      },
    })),
  };
}

/**
 * Parent testimonials, from the CMS (doc 14 §2.7).
 *
 * This page carried a hardcoded array and a TODO, "fetch from
 * `GET /content?type=testimonial&status=approved`", since the rebuild. The
 * array is gone. Only published testimonials appear, and the pipeline refuses
 * to publish one without a recorded consent source (doc 13 §9.4), so the claim
 * in the subheading below is enforced rather than asserted.
 */
export default async function TestimonialsPage() {
  const testimonials = await listTestimonials();

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <JsonLd
        docs={[
          reviewsJsonLd(testimonials),
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: TITLE, path: '/testimonials' },
          ]),
        ]}
      />
      <Reveal>
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Testimoni</p>
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
          Kata Orang Tua.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          Setiap cerita di bawah ini dimuat dengan izin keluarganya.
        </p>
      </Reveal>

      {testimonials.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            title="Belum ada testimoni"
            description="Cerita orang tua akan tampil di sini setelah tim menerbitkannya."
          />
        </div>
      ) : (
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, i) => (
            <Reveal key={testimonial.id} delay={i * 80}>
              <TestimonialQuote testimonial={testimonial} />
            </Reveal>
          ))}
        </div>
      )}

      <div className="mt-16 text-center">
        <Link
          href="/register"
          className="bg-navy inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Mulai konsultasi gratis
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
