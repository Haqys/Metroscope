'use client';

/**
 * CMS pipeline actions, from the browser via the BFF.
 *
 * Nothing here decides anything. Which transitions are legal is the API's
 * `TRANSITIONS` table, checked again by RLS, a button that should not be there
 * gets a 409 or a 403, and that answer is rendered rather than routed around.
 */
export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

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
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

export type PipelineAction =
  'submit' | 'approve' | 'reject' | 'schedule' | 'publish' | 'unpublish' | 'archive';

export const runAction = (
  type: string,
  id: string,
  action: PipelineAction,
  body: { note?: string; publishAt?: string } = {},
) => send(`/site/content/${type}/${id}/${action}`, 'POST', body);

export const restoreVersion = (type: string, id: string, version: number) =>
  send(`/site/content/${type}/${id}/restore`, 'POST', { version });

export const updateDraft = (type: string, id: string, patch: Record<string, unknown>) =>
  send(`/site/content/${type}/${id}`, 'PATCH', patch);
