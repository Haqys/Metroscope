'use client';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Reschedule requests, from the browser via the BFF (doc 14 §3.2).
 *
 * The first write the portal makes that is not about money. Authorised by
 * OWNERSHIP, `reschedule_requests_insert` checks `app.owns_student()` and pins
 * `requested_by_id` to the caller, so a family can only ask about their own
 * child's lesson and cannot file in somebody else's name.
 *
 * The H-1 rule is checked by the API too. The wizard only offers eligible
 * sessions, but a stale page is a real thing and the rule is the API's.
 */
async function send<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  try {
    const res = await fetch(`/api/bff${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: T;
      error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
    } | null;

    if (res.ok) return { ok: true, data: payload?.data };
    const issue = payload?.error?.details?.issues?.[0]?.message;
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal mengirim permintaan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

export const requestReschedule = (body: {
  sessionId: string;
  reason: string;
  note?: string | null;
  preferredStartsAt?: string | null;
}) => send<{ id: string; status: string }>('/reschedule-requests', 'POST', body);

export const withdrawReschedule = (id: string) =>
  send(`/reschedule-requests/${id}/withdraw`, 'POST');
