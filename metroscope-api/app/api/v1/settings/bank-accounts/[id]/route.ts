import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpsertBankAccount } from '@/modules/organization/organization.schema';
import {
  deactivateBankAccount,
  updateBankAccount,
} from '@/modules/organization/organization.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handler(
  {
    auth: 'required',
    action: 'settings.edit',
    body: UpsertBankAccount,
    audit: 'settings.bank-account-updated',
    rateLimit: { key: 'settings.banks.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateBankAccount(ctx, uuidParam(params), body)),
);

/**
 * Deactivates; never deletes. The account appears on invoices already sent and
 * payments already received, so the row has to outlive its use.
 */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'settings.edit',
    audit: 'settings.bank-account-deactivated',
    rateLimit: { key: 'settings.banks.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deactivateBankAccount(ctx, uuidParam(params))),
);
