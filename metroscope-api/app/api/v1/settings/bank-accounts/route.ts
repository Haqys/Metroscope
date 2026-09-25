import { handler, ok } from '@/lib/http/handler';
import { UpsertBankAccount } from '@/modules/organization/organization.schema';
import { createBankAccount, listBankAccounts } from '@/modules/organization/organization.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where parents transfer (FR-PAY-2).
 *
 * The GET declares no action verb because a GUARDIAN needs it. They cannot pay
 * an invoice without knowing the destination account, and they hold no grants at
 * all. RLS shows them the active accounts and nothing else.
 */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'settings.banks', limit: 120, window: '1 m' } },
  async ({ ctx }) => ok(await listBankAccounts(ctx)),
);

export const POST = handler(
  {
    auth: 'required',
    action: 'settings.edit',
    body: UpsertBankAccount,
    audit: 'settings.bank-account-created',
    rateLimit: { key: 'settings.banks.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createBankAccount(ctx, body), { status: 201 }),
);
