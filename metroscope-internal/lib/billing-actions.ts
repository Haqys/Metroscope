'use client';

/**
 * Payment verification, from the browser via the BFF.
 *
 * `payment.verify` is checked by the API and again by RLS; nothing here decides
 * anything. What this file does own is the Idempotency-Key discipline, see
 * below, because getting it wrong is how a single transfer gets recorded twice.
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

async function send(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ActionResult> {
  try {
    const res = await fetch(`/api/bff${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });

    const payload = (await res.json().catch(() => null)) as {
      data?: Record<string, unknown>;
      error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
    } | null;

    if (res.ok) return { ok: true, data: payload?.data };

    const issue = payload?.error?.details?.issues?.[0]?.message;
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

/**
 * Approve a transfer. `key` must be STABLE for a given invoice+attempt.
 *
 * This is the moment money is recognised. A key regenerated per click would
 * satisfy the required header and defeat what it is for: a double-clicked
 * Approve would record two payment rows against one transfer, and a partially
 * paid invoice would silently become overpaid.
 */
export function verifyPayment(
  invoiceId: string,
  key: string,
  input: { grossAmount?: number; note?: string } = {},
) {
  return send(
    `/invoices/${invoiceId}/verify`,
    {
      ...(input.grossAmount !== undefined ? { grossAmount: input.grossAmount } : {}),
      ...(input.note ? { note: input.note } : {}),
      method: 'TRANSFER',
    },
    { 'Idempotency-Key': key },
  );
}

/** Send a proof back. The reason is required by the API, not just by the form. */
export function rejectPayment(invoiceId: string, reason: string) {
  return send(`/invoices/${invoiceId}/reject`, { reason });
}

/** A five-minute signed URL for the proof image. */
export async function proofUrl(invoiceId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/bff/invoices/${invoiceId}/proof-view`);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Issue a drafted month.
 *
 * `key` must be STABLE for the run being issued. This turns a whole month of
 * drafts into real bills and emails every family, a double-clicked button must
 * replay the first response, not attempt a second issue.
 */
export function issueBillingRun(runId: string, key: string) {
  return send(`/billing-runs/${runId}/issue`, {}, { 'Idempotency-Key': key });
}
