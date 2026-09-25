'use client';

import type { ActionResult } from '@/lib/media-actions';

/**
 * Progress writes, from the browser via the BFF (doc 14 §3.6).
 *
 * `progress.edit` is checked by the API and again by `progress_insert` /
 * `progress_update`, which additionally pin `updated_by_id` to the caller. A
 * 403 is an answer to render.
 *
 * Only the sliders that moved are sent. A whole-student replacement would let a
 * save silently zero the topics that were not on screen, and the mentor would
 * have no way to know it happened.
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

export const updateProgress = (
  studentIdOrSlug: string,
  entries: { topicId: string; percent: number }[],
) =>
  send<{
    studentId: string;
    updated: { topicId: string; percent: number }[];
    state: { status: string; overallPercent: number | null; daysSinceUpdate: number | null } | null;
  }>(`/students/${studentIdOrSlug}/progress`, 'PATCH', { entries });

/**
 * Topic management (§3.6. FR-UPD-2's prerequisite).
 *
 * `material.manage`, not a new verb: doc 13 puts topic CRUD on `/materials`,
 * and a topic is the unit a material is filed under.
 */
export const createTopic = (programId: string, name: string) =>
  send<{ id: string }>('/topics', 'POST', { programId, name });

export const renameTopic = (id: string, name: string) =>
  send<{ id: string; name: string }>(`/topics/${id}`, 'PATCH', { name });

export const deleteTopic = (id: string) => send(`/topics/${id}`, 'DELETE');
