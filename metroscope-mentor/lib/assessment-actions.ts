'use client';

import type { ActionResult } from '@/lib/material-actions';
import type { CriterionKey } from '@/lib/api';

/**
 * Assessment writes, from the browser via the BFF (doc 14 §3.5).
 *
 * Nothing here decides anything. `assessment.submit` is checked by the API and
 * again by `98_assessments.sql`, which additionally pins `mentor_id` to the
 * caller, so a 403 is an answer to render, not a case to pre-empt.
 *
 * Absent on purpose: the reaction. FR-ASV-4 gives that to the FAMILY, and
 * `assessment_reactions_write` refuses staff outright, a mentor marking their
 * own assessment "helpful" would make the number describe the staff rather than
 * the families. It lives in the portal's own actions module.
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

export const submitAssessment = (body: {
  studentId: string;
  period?: string;
  scores: Record<CriterionKey, number>;
  note: string;
}) =>
  send<{ id: string; avgScore: number; category: string; pointsAwarded: number }>(
    '/assessments',
    'POST',
    body,
  );

/** A correction by the author. `assessments_update` refuses everybody else. */
export const updateAssessment = (
  id: string,
  body: { scores?: Record<CriterionKey, number>; note?: string },
) => send<{ id: string; avgScore: number; category: string }>(`/assessments/${id}`, 'PATCH', body);

export const claimStudent = (studentId: string, period?: string) =>
  send<{ expiresAt: string }>('/assessments/claims', 'POST', { studentId, period });

export const releaseClaim = (studentId: string, period?: string) =>
  send(`/assessments/claims/${studentId}${period ? `?period=${period}` : ''}`, 'DELETE');
