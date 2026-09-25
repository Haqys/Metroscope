import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';

import { JsonLd } from '@/components/marketing/json-ld';
import { resolveRedirect } from '@/lib/articles-api';
import { getMentor, type MentorDetail } from '@/lib/surfaces-api';
import { SITE, breadcrumbList, clamp, social } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Rendered per request; the DATA stays tag-cached, the same arrangement
 * `/articles/[slug]` and `/programs/[slug]` use, and for the same reason: a
 * cached `notFound()` would shadow the 301 after a rename, permanently.
 */
export const dynamic = 'force-dynamic';

function seoFor(mentor: MentorDetail) {
  const url = mentor.seoCanonical ?? `${SITE}/mentors/${mentor.slug}`;
  return {
    url,
    title: clamp(mentor.seoTitle ?? mentor.displayName, 60),
    description: clamp(
      mentor.seoDescription ?? mentor.headline ?? `Mentor Metroscope: ${mentor.displayName}.`,
      155,
    ),
    image: mentor.photoUrl,
  };
}

/** Decide 200 / 301 / 404 in `generateMetadata`, before the response commits. */
async function resolveOrLeave(slug: string) {
  const mentor = await getMentor(slug);
  if (mentor) return mentor;

  const hit = await resolveRedirect(`/mentors/${slug}`);
  if (hit) {
    if (hit.statusCode === 301 || hit.statusCode === 308) permanentRedirect(hit.toPath);
    redirect(hit.toPath);
  }
  notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const mentor = await resolveOrLeave(slug);
  const { url, title, description, image } = seoFor(mentor);
  const s = social({ title, description, url, image, imageAlt: mentor.photoAlt });

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: mentor.seoNoindex ? { index: false, follow: true } : undefined,
    openGraph: { ...s.openGraph, type: 'profile' },
    twitter: s.twitter,
  };
}

/**
 * One mentor profile.
 *
 * Everything rendered is copy the mentor agreed to publish. `user_id` is not in
 * the payload at all, the CMS knows whose profile this is, the public page
 * does not need to, and an internal account id in a public response is an
 * invitation to try it somewhere else.
 */
export default async function MentorPage({ params }: PageProps) {
  const { slug } = await params;
  const mentor = await resolveOrLeave(slug);

  return (
    <div className="container pt-10 pb-24 lg:pt-14">
      {/*
        Breadcrumbs only. No `Person` node: schema.org's `Person` invites
        `worksFor`, `email` and `telephone`, and the entire reason
        `mentor_profiles` is a separate table is that a public mentor page must
        carry nothing that identifies the ACCOUNT behind it (§2.7). Structured
        data is not an exception to that. It is the machine-readable version of
        the same page.
      */}
      <JsonLd
        docs={[
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: 'Mentor', path: '/mentors' },
            { name: mentor.displayName, path: `/mentors/${mentor.slug}` },
          ]),
        ]}
      />

      <Link
        href="/mentors"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Semua mentor
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[20rem_1fr]">
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-neutral-100">
            {mentor.photoUrl ? (
              <Image
                src={mentor.photoUrl}
                alt={mentor.photoAlt ?? ''}
                fill
                sizes="(min-width: 1024px) 20rem, 100vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="from-navy/10 to-maroon/10 absolute inset-0 bg-gradient-to-br" />
            )}
          </div>

          {mentor.specialisms.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold tracking-[0.25em] text-neutral-400 uppercase">
                Spesialisasi
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {mentor.specialisms.map((s) => (
                  <li
                    key={s}
                    className="bg-maroon-light text-maroon rounded-full px-3 py-1 text-xs font-medium"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="max-w-2xl min-w-0">
          <h1 className="font-serif text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
            {mentor.displayName}
          </h1>
          {mentor.headline && (
            <p className="mt-4 text-xl leading-relaxed font-light text-neutral-500">
              {mentor.headline}
            </p>
          )}

          {mentor.bio && (
            <div className="mt-8 space-y-5">
              {/* Plain text, split on blank lines, never markup. */}
              {mentor.bio
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className="leading-[1.8] text-neutral-700">
                    {para}
                  </p>
                ))}
            </div>
          )}

          {/*
            Articles this mentor wrote, real published content joined on
            `author_id`, not a second list somebody has to maintain.
          */}
          {mentor.articles.length > 0 && (
            <div className="mt-12 border-t border-neutral-200 pt-8">
              <h2 className="font-serif text-xl font-medium text-neutral-900">
                Tulisan mentor ini
              </h2>
              <ul className="mt-5 space-y-4">
                {mentor.articles.map((article) => (
                  <li key={article.slug}>
                    <Link href={`/articles/${article.slug}`} className="group block">
                      <h3 className="group-hover:text-maroon font-medium text-neutral-900 transition-colors">
                        {article.title}
                      </h3>
                      {article.excerpt && (
                        <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                          {article.excerpt}
                        </p>
                      )}
                      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-400">
                        <Clock className="h-3 w-3" aria-hidden />
                        {article.readingMin} menit
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="from-navy to-maroon mt-12 rounded-3xl bg-gradient-to-br px-8 py-10 text-center text-white">
            <h2 className="font-serif text-2xl font-medium">Ingin dibimbing mentor ini?</h2>
            <p className="mx-auto mt-2 max-w-md font-light text-white/80">
              Mulai dari konsultasi gratis. Kami cocokkan mentor dengan minat anak Anda.
            </p>
            <Link
              href="/register"
              className="text-navy mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            >
              Konsultasi Gratis
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
