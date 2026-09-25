'use client';

/**
 * Bank account mutations, from the browser via the BFF.
 *
 * Every rule, `settings.edit`, field validation, the audit row, is enforced by
 * the API. Nothing here re-implements any of it; the messages returned are the
 * API's own, already in Indonesian.
 */
export interface BankAccountInput {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  note?: string;
  isActive: boolean;
  orderIndex: number;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function send(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  try {
    const res = await fetch(`/api/bff${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true };

    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
    } | null;
    const issue = payload?.error?.details?.issues?.[0]?.message;
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

export const createBankAccount = (input: BankAccountInput): Promise<ActionResult> =>
  send('/settings/bank-accounts', 'POST', input);

export const updateBankAccount = (id: string, input: BankAccountInput): Promise<ActionResult> =>
  send(`/settings/bank-accounts/${id}`, 'PATCH', input);

/** Deactivates. The row survives because old invoices still reference it. */
export const deactivateBankAccount = (id: string): Promise<ActionResult> =>
  send(`/settings/bank-accounts/${id}`, 'DELETE');
