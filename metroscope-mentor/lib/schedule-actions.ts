'use client';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * The two scheduling writes a MENTOR can perform, and no others.
 *
 * Not a copy of the internal app's module: creating, moving, cancelling and
 * ending a series all need `session.manage`, which doc 13 §8.3 does not give
 * this role and migration 0019 took away. Exporting them here would put four
 * functions in the mentor bundle whose only possible outcome is a 403, and
 * would invite a screen to be built around them.
 *
 * What a mentor does own: recording what they observed in their own lesson, and
 * saying when they are free. `session_attendance_write` and
 * `mentor_availability_write` authorise both by ownership rather than by a verb.
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

export const markAttendance = (id: string, status: string, note?: string) =>
  send(`/sessions/${id}/attendance`, 'PUT', { status, note: note?.trim() || null });

export const setAvailability = (slots: { weekday: number; startTime: string; endTime: string }[]) =>
  send('/availability', 'PUT', { slots });
