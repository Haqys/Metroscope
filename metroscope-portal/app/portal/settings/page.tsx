import type { Metadata } from 'next';

import { PageHeader } from '@/components/portal/page-header';
import { ProfileSettings } from '@/components/portal/profile-settings';
import { SettingsNav } from '@/components/portal/settings-nav';
import { getMyProfile } from '@/lib/api';

export const metadata: Metadata = { title: 'Pengaturan Profil' };

/** Every field on this page belongs to one account. Never cache it. */
export const dynamic = 'force-dynamic';

export default async function SettingsProfilePage() {
  const profile = await getMyProfile();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Pengaturan" subtitle="Kelola profil, notifikasi, dan keamanan akun." />

      <div className="mt-8">
        <SettingsNav />
      </div>
      <div className="mt-6">
        <ProfileSettings profile={profile} />
      </div>
    </div>
  );
}
