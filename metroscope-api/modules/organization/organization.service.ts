import { sql } from 'drizzle-orm';
import type { RequestContext } from '@/lib/auth/context';
import { asUser } from '@/lib/db/rls';
import { ApiError } from '@/lib/http/errors';
import { writeAuditLog } from '@/lib/audit';
import type { UpsertBankAccountInput } from './organization.schema';

/**
 * Organisation settings, currently just the accounts parents transfer to.
 *
 * Runs as the caller throughout. RLS shows active accounts to everyone signed
 * in (a guardian needs them to pay) and everything to `settings.edit` holders,
 * so there is one query rather than one per audience.
 */
export interface BankAccountRow extends Record<string, unknown> {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note: string | null;
  isActive: boolean;
  orderIndex: number;
}

export async function listBankAccounts(ctx: RequestContext): Promise<BankAccountRow[]> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<BankAccountRow>(sql`
      SELECT id,
             bank_name      AS "bankName",
             account_number AS "accountNumber",
             account_holder AS "accountHolder",
             note,
             is_active      AS "isActive",
             order_index    AS "orderIndex"
      FROM bank_accounts
      ORDER BY order_index ASC, bank_name ASC
    `);
    return Array.from(rows) as BankAccountRow[];
  });
}

export async function createBankAccount(ctx: RequestContext, input: UpsertBankAccountInput) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO bank_accounts
        (bank_name, account_number, account_holder, note, is_active, order_index)
      VALUES (${input.bankName}, ${input.accountNumber}, ${input.accountHolder},
              ${input.note ?? null}, ${input.isActive}, ${input.orderIndex})
      RETURNING id
    `);
    return (Array.from(rows) as { id: string }[]).at(0) ?? null;
  });

  if (!created) throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang mengubah setelan.');

  /**
   * Audited like money, because it is money. Changing the destination account
   * redirects every future transfer. It is the highest-leverage settings
   * change in the product, and the one worth being able to reconstruct later.
   */
  await writeAuditLog({
    ctx,
    action: 'settings.bank-account-created',
    entity: 'bank_account',
    entityId: created.id,
    after: {
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      accountHolder: input.accountHolder,
    },
  });

  return created;
}

export async function updateBankAccount(
  ctx: RequestContext,
  id: string,
  input: UpsertBankAccountInput,
) {
  const before = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<BankAccountRow>(sql`
      SELECT id, bank_name AS "bankName", account_number AS "accountNumber",
             account_holder AS "accountHolder", is_active AS "isActive"
      FROM bank_accounts WHERE id = ${id}::uuid
    `);
    return (Array.from(rows) as BankAccountRow[]).at(0) ?? null;
  });
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Rekening tidak ditemukan.');

  const updated = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE bank_accounts
      SET bank_name      = ${input.bankName},
          account_number = ${input.accountNumber},
          account_holder = ${input.accountHolder},
          note           = ${input.note ?? null},
          is_active      = ${input.isActive},
          order_index    = ${input.orderIndex}
      WHERE id = ${id}::uuid
      RETURNING id
    `);
    return (Array.from(rows) as { id: string }[]).at(0) ?? null;
  });

  if (!updated) throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang mengubah setelan.');

  await writeAuditLog({
    ctx,
    action: 'settings.bank-account-updated',
    entity: 'bank_account',
    entityId: id,
    before: {
      bankName: before.bankName,
      accountNumber: before.accountNumber,
      accountHolder: before.accountHolder,
      isActive: before.isActive,
    },
    after: {
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      accountHolder: input.accountHolder,
      isActive: input.isActive,
    },
  });

  return updated;
}

/**
 * Deactivate rather than delete.
 *
 * A removed account still appears on invoices already sent and in payments
 * already received; deleting the row would orphan that history. `is_active`
 * hides it from the pay page, which is the only thing anybody actually wants.
 */
export async function deactivateBankAccount(ctx: RequestContext, id: string) {
  const updated = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE bank_accounts SET is_active = false WHERE id = ${id}::uuid RETURNING id
    `);
    return (Array.from(rows) as { id: string }[]).at(0) ?? null;
  });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Rekening tidak ditemukan.');

  await writeAuditLog({
    ctx,
    action: 'settings.bank-account-deactivated',
    entity: 'bank_account',
    entityId: id,
  });

  return updated;
}
