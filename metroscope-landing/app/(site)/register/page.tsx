import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RegistrationWizard } from '@/components/forms/registration-wizard';
import { listPublicPrograms } from '@/lib/programs-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION =
  'Metroscope program registration form, 4 easy steps, email confirmation within 24 hours.';
const URL = absolute('/register');
const SOCIAL = social({
  title: 'Program Registration · Metroscope',
  description: DESCRIPTION,
  url: URL,
});

export const metadata: Metadata = {
  title: 'Program Registration',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const programs = await listPublicPrograms();

  return (
    <div className="container max-w-4xl pt-14 pb-28 lg:pt-16">
      <h1 className="font-serif text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">
        Program Registration Form
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Just 4 easy steps, our team will confirm via email.
      </p>

      <div className="mt-12">
        <Suspense>
          <RegistrationWizard programs={programs} />
        </Suspense>
      </div>
    </div>
  );
}
