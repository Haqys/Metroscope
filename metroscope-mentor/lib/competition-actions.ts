'use client';

import type { ActionResult } from '@/lib/material-actions';

/**
 * The ONE competition write a mentor has (doc 14 §3.4).
 *
 * doc 13 §8.3 lists the Mentor's five key actions: mark attendance, update
 * progress, fill assessment, **record competition result**, assign material.
 * Recording readiness and a result is `progress.edit`, which they hold.
 *
 * Deliberately nothing else. Entering a student in a lomba, forming teams and
 * authoring the catalogue are `student.edit` and the `/site` page grant, a
 * mentor holds neither, so shipping those functions here would ship buttons
 * that exist only to return 403. `97_competitions.sql` is what actually
 * enforces this; the shape of this file is just honest about it, the same way
 * `schedule-actions.ts` carries two functions rather than the internal app's
 * seven.
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

export const updateTarget = (
  competitionId: string,
  targetId: string,
  body: {
    readinessPct?: number;
    result?: string;
    award?: string | null;
    score?: number | null;
    note?: string | null;
  },
) => send(`/competitions/${competitionId}/targets/${targetId}`, 'PATCH', body);
