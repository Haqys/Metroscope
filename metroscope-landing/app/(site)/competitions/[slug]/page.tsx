import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { ArrowLeft, CalendarClock, ExternalLink } from 'lucide-react';

import { JsonLd } from '@/components/marketing/json-ld';
import { resolveRedirect } from '@/lib/articles-api';
import {
  FORMAT_LABEL,
  LEVEL_LABEL,
  MODE_LABEL,
  PHASE_LABEL,
  daysUntil,
  formatDeadline,
  formatEventRange,
  formatFee,
  getCompetition,
  type PublicCompetitionDetail,
} from '@/lib/competitions-api';
import { SITE, breadcrumbList, clamp, social } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Rendered per request; the DATA stays tag-cached, the same arrangement
 * `/articles/[slug]`, `/programs/[slug]` and `/mentors/[slug]` use. A cached
 * `notFound()` would shadow the 301 after a rename, permanently.
 */
export const dynamic = 'force-dynamic';

function seoFor(c: PublicCompetitionDetail) {
  const url = c.seoCanonical ?? `${SITE}/competitions/${c.slug}`;
  return {
    url,
    title: clamp(c.seoTitle ?? c.name, 60),
    description: clamp(
      c.seoDescription ??
        c.summary ??
        `${c.name}, deadline pendaftaran ${formatDeadline(c.registrationDeadline)}.`,
      155,
    ),
  };
}

/** Decide 200 / 301 / 404 in `generateMetadata`, before the response commits. */
async function resolveOrLeave(slug: string) {
  const competition = await getCompetition(slug);
  if (competition) return competition;

  const hit = await resolveRedirect(`/competitions/${slug}`);
  if (hit) {
    if (hit.statusCode === 301 || hit.statusCode === 308) permanentRedirect(hit.toPath);
    redirect(hit.toPath);
  }
  notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const competition = await resolveOrLeave(slug);
  const { url, title, description } = seoFor(competition);
  const s = social({ title, description, url });

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: competition.seoNoindex ? { index: false, follow: true } : undefined,
    openGraph: { ...s.openGraph, type: 'website' },
    twitter: s.twitter,
  };
}

/**
 * One competition, publicly (doc 13 §21: `/competitions/[slug]`, "detail +
 * guidebook").
 *
 * Everything on this page is the row a Secretary maintains and an editor
 * publishes. What is NOT on it: who from Metroscope is entered, how ready they
 * are, and how they did. Those live on `competition_targets`, which `anon`
 * holds no grant on at any level, a lead magnet may not also be a list of
 * children.
 */
export default async function CompetitionPage({ params }: PageProps) {
  const { slug } = await params;
  const c = await resolveOrLeave(slug);
  const days = daysUntil(c.registrationDeadline);
  const eventRange = formatEventRange(c.eventStart, c.eventEnd);

  /**
   * schema.org `Event`, because that is what a competition is and it is what
   * earns the date-rich result in search. `Event` wants a location; an online
   * lomba gets `VirtualLocation`, which is the correct answer rather than a
   * blank venue string.
   */
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: c.name,
    description: c.summary ?? undefined,
    startDate: c.eventStart ?? undefined,
    endDate: c.eventEnd ?? c.eventStart ?? undefined,
    eventAttendanceMode:
      c.mode === 'ONLINE'
        ? 'https://schema.org/OnlineEventAttendanceMode'
        : c.mode === 'HYBRID'
          ? 'https://schema.org/MixedEventAttendanceMode'
          : 'https://schema.org/OfflineEventAttendanceMode',
    location:
      c.mode === 'ONLINE'
        ? { '@type': 'VirtualLocation', url: c.registrationUrl ?? `${SITE}/competitions/${c.slug}` }
        : c.venue
          ? { '@type': 'Place', name: c.venue, address: c.venue }
          : undefined,
    organizer: c.organizer ? { '@type': 'Organization', name: c.organizer } : undefined,
    url: `${SITE}/competitions/${c.slug}`,
  };

  return (
    <div className="container pt-10 pb-24 lg:pt-14">
      <JsonLd
        docs={[
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: 'Info Lomba', path: '/competitions' },
            { name: c.name, path: `/competitions/${c.slug}` },
          ]),
          eventJsonLd,
        ]}
      />

      <Link
        href="/competitions"
        className="hover:text-maroon flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Semua lomba
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-12">
        <article className="lg:col-span-7">
          <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">
            {LEVEL_LABEL[c.level]}
          </p>
          <h1 className="mt-4 font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.1] font-medium tracking-tight text-neutral-900">
            {c.name}
          </h1>
          {c.summary ? (
            <p className="mt-5 text-lg leading-relaxed font-light text-neutral-500">{c.summary}</p>
          ) : null}

          {c.description ? (
            <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-neutral-700">
              {c.description.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}
        </article>

        <aside className="lg:col-span-5">
          <div className="sticky top-24 rounded-2xl border border-neutral-200/70 bg-white p-6">
            <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-400 uppercase">
              <CalendarClock className="h-3.5 w-3.5" />
              {PHASE_LABEL[c.phase]}
            </p>
            <p className="mt-3 font-serif text-2xl font-medium tracking-tight text-neutral-900">
              {formatDeadline(c.registrationDeadline)}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {days < 0
                ? 'Pendaftaran sudah ditutup'
                : days === 0
                  ? 'Hari terakhir pendaftaran'
                  : `${days} hari lagi · waktu WITA`}
            </p>

            <dl className="mt-6 space-y-3 border-t border-neutral-100 pt-6 text-sm">
              <Row label="Penyelenggara" value={c.organizer} />
              <Row label="Biaya" value={formatFee(c.registrationFee, c.feeNote)} />
              <Row label="Format" value={`${FORMAT_LABEL[c.format]} · ${MODE_LABEL[c.mode]}`} />
              <Row label="Jenjang" value={c.levels.length ? c.levels.join(', ') : null} />
              <Row label="Bidang" value={c.categories.length ? c.categories.join(', ') : null} />
              <Row label="Pelaksanaan" value={eventRange} />
              <Row label="Lokasi" value={c.venue} />
            </dl>

            <div className="mt-6 space-y-2">
              {c.registrationUrl ? (
                <a
                  href={c.registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-maroon flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Daftar di penyelenggara
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {c.guidebookUrl ? (
                <a
                  href={c.guidebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300"
                >
                  Panduan resmi
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <Link
                href="/register"
                className="flex w-full items-center justify-center rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Siapkan anak untuk lomba ini
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-4">
      <dt className="w-28 shrink-0 text-neutral-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-neutral-800">{value}</dd>
    </div>
  );
}
