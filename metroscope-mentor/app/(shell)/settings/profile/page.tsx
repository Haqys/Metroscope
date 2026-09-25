import type { Metadata } from 'next';

import { StaffProfileForm } from '@/components/forms/staff-profile-form';
import { PageHeader } from '@/components/portal/page-header';
import { getOwnProfile } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Profil Saya' };

/**
 * Edit own profile (doc 11 §11: identity now lives on User).
 *
 * Two reads, and they answer different questions. `requireSession()` is
 * `/v1/auth/me`, identity plus grants, which is what decides whether the bio
 * field is shown at all. `getOwnProfile()` is `/v1/me/profile`, the row
 * itself, which carries `bio` and `phone`, the fields this form edits.
 * `/v1/auth/me` deliberately does not return them: it answers "who is this
 * and what may they do", and a public biography is neither.
 *
 * `force-dynamic`: it is one person's own record, and it changes on this page.
 */
export const dynamic = 'force-dynamic';

export default async function StaffProfilePage() {
  const [session, profile] = await Promise.all([requireSession(), getOwnProfile()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Profil Saya"
        subtitle="Nama, foto, dan bio yang dilihat tim serta orang tua siswa."
      />

      <div className="mt-8">
        <StaffProfileForm user={session} profile={profile} />
      </div>
    </div>
  );
}
