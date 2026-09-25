'use client';

/**
 * Lead mutations, from the browser.
 *
 * Everything goes to `/api/bff/*` on THIS origin. The BFF attaches the access
 * token server-side from the HttpOnly cookie, so no token is ever readable from
 * JavaScript and an XSS cannot become account takeover (doc 04 §0.4).
 *
 * There is no validation here beyond what the form needs to render an error.
 * Every rule, a lost lead needing a reason, a converted lead being immutable,
 * the caller holding `lead.approve`, is enforced by the API and again by RLS.
 * Re-implementing any of it would create a second copy that drifts.
 */

export interface ActionResult {
  ok: boolean;
  /** Message in Indonesian, already suitable to show the user. */
  error?: string;
  /** Response envelope on success, for actions that return something. */
  data?: { data?: Record<string, unknown> } | null;
}

async function send(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ActionResult> {
  try {
    const res = await fetch(`/api/bff${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });

    if (res.ok) return { ok: true, data: await res.json().catch(() => null) };

    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
    } | null;

    // Surface the first field-level message when there is one; it is specific.
    const issue = payload?.error?.details?.issues?.[0]?.message;
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

/**
 * `followUpAt` is required by the API when status is NURTURING, a lead parked
 * for "later" with no date is a lead nobody comes back to.
 */
export function setLeadStatus(
  id: string,
  status: 'NEW' | 'CONSULTING' | 'NURTURING' | 'REJECTED' | 'LOST',
  reason?: string,
  followUpAt?: Date,
) {
  return send(`/registrations/${id}/status`, 'PATCH', {
    status,
    ...(reason ? { reason } : {}),
    ...(followUpAt ? { followUpAt: followUpAt.toISOString() } : {}),
  });
}

export function logContact(id: string, note: string, followUpAt?: Date) {
  return send(`/registrations/${id}/contact`, 'POST', {
    note,
    ...(followUpAt ? { followUpAt: followUpAt.toISOString() } : {}),
  });
}

export function recordConsultationOutcome(
  id: string,
  outcome: 'LANJUT' | 'PIKIR_DULU' | 'TIDAK_COCOK',
  opts: { lossReason?: 'PRICE' | 'SCHEDULE' | 'FIT' | 'OTHER'; note?: string; followUpAt?: Date },
) {
  return send(`/registrations/${id}/consultation-outcome`, 'POST', {
    outcome,
    ...(opts.lossReason ? { lossReason: opts.lossReason } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.followUpAt ? { followUpAt: opts.followUpAt.toISOString() } : {}),
  });
}

/**
 * Convert a lead into a paying student (FR-ENR-1).
 *
 * The Idempotency-Key is REQUIRED by the endpoint, and it is generated once per
 * mounted form rather than per click. That is the point: a double-clicked
 * button, or a retry after a flaky connection, replays the first response
 * instead of creating a second student with a second invoice. Generating a
 * fresh key per click would defeat it entirely.
 */
export function convertLead(id: string, key: string, opts: { programId?: string } = {}) {
  return send(
    `/registrations/${id}/convert`,
    'POST',
    { ...(opts.programId ? { programId: opts.programId } : {}) },
    { 'Idempotency-Key': key },
  );
}
