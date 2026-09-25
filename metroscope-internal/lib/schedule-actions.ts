'use client';

import type { ActionResult } from '@/lib/media-actions';

/**
 * Scheduling writes, from the browser via the BFF (doc 14 §3.1).
 *
 * Nothing here decides anything. `session.manage` is checked by the API and
 * again by RLS; the overlap constraints are checked by Postgres. A 403 or a 409
 * is an answer to render, not a branch to route around, which matters more
 * here than usual, because the 409 is the double-booking this module exists to
 * prevent and the user needs to read it, not be protected from it.
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
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

export const createSession = (body: Record<string, unknown>) =>
  send<{ id: string }>('/sessions', 'POST', body);

export const createSeries = (body: Record<string, unknown>) =>
  send<{ id: string; created: number; skipped: number }>('/session-series', 'POST', body);

export const updateSession = (id: string, body: Record<string, unknown>) =>
  send(`/sessions/${id}`, 'PATCH', body);

export const cancelSession = (id: string, reason: string) =>
  send(`/sessions/${id}/cancel`, 'POST', { reason });

export const markAttendance = (id: string, status: string, note?: string) =>
  send(`/sessions/${id}/attendance`, 'PUT', { status, note: note?.trim() || null });

export const endSeries = (id: string, reason: string, effectiveFrom?: string) =>
  send(`/session-series/${id}/end`, 'POST', { reason, effectiveFrom });

export const setAvailability = (
  slots: { weekday: number; startTime: string; endTime: string }[],
  mentorId?: string,
) => send('/availability', 'PUT', { slots, mentorId });

export interface ConflictReport {
  conflicts: { id: string; startsAt: string; endsAt: string; studentName: string }[];
  outsideAvailability: boolean;
  hasAvailabilityTemplate: boolean;
}

/**
 * The pre-flight, run as the form is filled in.
 *
 * Advisory only, `sessions_mentor_no_overlap` is what actually prevents a
 * double-booking and cannot be raced. This tells somebody before they submit.
 */
export async function checkConflicts(params: {
  mentorId: string;
  studentId?: string;
  startsAt: string;
  durationMin: number;
  excludeId?: string;
}): Promise<ConflictReport | null> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const result = await send<ConflictReport>(`/sessions/conflicts?${qs}`, 'GET');
  return result.ok && result.data ? result.data : null;
}

/**
 * Deciding a reschedule request (doc 14 §3.2).
 *
 * `approve` names the time the lesson actually moves to, and the form pre-fills
 * it with what the family asked for rather than defaulting to it server-side:
 * the reason a human is in this loop is that the preferred slot is often taken,
 * and a default that silently booked it would make the queue a rubber stamp.
 */
export const approveReschedule = (
  id: string,
  body: { startsAt: string; durationMin?: number; note?: string | null },
) => send(`/reschedule-requests/${id}/approve`, 'POST', body);

export const rejectReschedule = (id: string, note: string) =>
  send(`/reschedule-requests/${id}/reject`, 'POST', { note });
