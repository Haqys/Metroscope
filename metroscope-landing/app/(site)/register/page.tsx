import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RegistrationWizard } from '@/components/forms/registration-wizard';
import { listPublicPrograms } from '@/lib/programs-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION =
  'Form pendaftaran & konsultasi gratis Metroscope, 4 langkah mudah, konfirmasi via email dalam 1×24 jam.';
const URL = absolute('/register');
const SOCIAL = social({
  title: 'Konsultasi Gratis · Metroscope',
  description: DESCRIPTION,
  url: URL,
});

/**
 * Indexable, and canonical to itself.
 *
 * It is the target of every CTA on the site and the page people are sent
 * directly, so it must be shareable and it must not be mistaken for a
 * duplicate of `/programs/[slug]`, which embeds the same form.
 */
export const metadata: Metadata = {
  title: 'Konsultasi Gratis',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

export const dynamic = 'force-dynamic';

/**
 * Registration wizard (wireframe: Input Form 1/3), target of every
 * "Konsultasi Gratis" CTA.
 *
 * Programmes are fetched server-side from `/v1/public/programs`, the same
 * endpoint the marketing pages read since §2.5. That matters: the picker must
 * submit a real `programId`, and while a fixture drove the marketing pages the
 * two could not agree, because the fixture's slugs (`science-olympiad`, …) had
 * no counterpart in the database at all.
 */
export default async function RegisterPage() {
  const programs = await listPublicPrograms();

  return (
    <div className="container max-w-4xl pt-14 pb-28 lg:pt-16">
      <h1 className="font-serif text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">
        Form Pendaftaran / Konsultasi
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Cukup 4 langkah mudah, tim kami bantu konfirmasi lewat email.
      </p>

      <div className="mt-12">
        <Suspense>
          <RegistrationWizard programs={programs} />
        </Suspense>
      </div>
    </div>
  );
}
