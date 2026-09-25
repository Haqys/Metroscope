import type { Metadata } from 'next';

import { BankAccountsManager } from '@/components/internal/bank-accounts-manager';
import { PageHeader } from '@/components/portal/page-header';
import { listBankAccounts } from '@/lib/api';

export const metadata: Metadata = { title: 'Rekening & Organisasi' };
export const dynamic = 'force-dynamic';

/**
 * Where parents send money (FR-PAY-2).
 *
 * Split out of a general settings page because it is the only setting with
 * money attached: changing a number here redirects every future transfer. The
 * API audits each change with before/after for exactly that reason.
 */
export default async function OrganizationSettingsPage() {
  const accounts = await listBankAccounts();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Rekening & Organisasi"
        subtitle="Rekening tujuan transfer yang dilihat orang tua di halaman pembayaran."
      />
      <div className="mt-8">
        <BankAccountsManager accounts={accounts} />
      </div>
    </div>
  );
}
