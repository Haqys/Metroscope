import type { Metadata } from 'next';

import { RoleManager } from '@/components/internal/role-manager';
import { PageHeader } from '@/components/portal/page-header';
import { listRoles } from '@/lib/api';

export const metadata: Metadata = { title: 'Kelola Role' };
export const dynamic = 'force-dynamic';

/** Internal, create custom roles and grant them pages + verbs (doc 12 §1). */
export default async function RolesSettingsPage() {
  const roles = await listRoles();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Kelola Role"
        subtitle="Buat role sendiri, tentukan halaman yang boleh dibuka dan tindakan yang boleh dilakukan. Role bawaan tidak bisa dihapus."
      />

      <div className="mt-8">
        <RoleManager roles={roles} />
      </div>
    </div>
  );
}
