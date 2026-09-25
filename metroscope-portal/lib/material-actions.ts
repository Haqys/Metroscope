'use client';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * The one material write a family makes: recording what their child studied.
 *
 * Authorised by ownership AND entitlement, `material_progress_write` checks
 * both, so a family cannot record progress against a module nobody gave them.
 * Staff cannot write this at all, which is the point: the engagement number
 * has to describe students rather than the people asking about them.
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

export const setMaterialProgress = (
  materialId: string,
  studentId: string,
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE',
) => send(`/materials/${materialId}/progress`, 'PUT', { studentId, status });
