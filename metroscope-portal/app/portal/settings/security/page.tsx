import type { Metadata } from 'next';

import { SecuritySettings } from '@/components/portal/security-settings';
import { SettingsNav } from '@/components/portal/settings-nav';

export const metadata: Metadata = { title: 'Keamanan Akun' };

export default function SettingsSecurityPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl font-medium tracking-tight text-neutral-900 sm:text-4xl">
        Pengaturan
      </h1>
      <p className="mt-1.5 text-sm text-neutral-500">
        Kelola profil, notifikasi, dan keamanan akun.
      </p>

      <div className="mt-8">
        <SettingsNav />
      </div>
      <div className="mt-6">
        <SecuritySettings />
      </div>
    </div>
  );
}
