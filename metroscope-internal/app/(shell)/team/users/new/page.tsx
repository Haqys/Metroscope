import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { UserForm } from '@/components/forms/user-form';
import { PageHeader } from '@/components/portal/page-header';
import { listRoles } from '@/lib/api';

export const metadata: Metadata = { title: 'User Baru' };
export const dynamic = 'force-dynamic';

/** Internal, create a staff account (doc 12 §3, HEAD only). */
export default async function NewUserPage() {
  const roles = await listRoles();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/team"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke User & Role
      </Link>

      <PageHeader
        className="mt-4"
        title="User Baru"
        subtitle="Buat akun tim internal dan tentukan role-nya. Undangan dikirim via email."
      />

      <div className="mt-8">
        <UserForm roles={roles} />
      </div>
    </div>
  );
}
