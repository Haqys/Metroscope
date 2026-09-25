'use client';

import type { ActionResult } from '@/lib/media-actions';

/**
 * Competition writes, from the browser via the BFF (doc 14 §3.4).
 *
 * Nothing here decides anything, and the split below is not enforced here
 * either, the API checks `student.edit` on the roster calls and `progress.edit`
 * on the result call, and `97_competitions.sql` checks both again. A 403 is an
 * answer to render, which is why the roster buttons and the result form are
 * separate components: a Secretary sees one working and one refusing, and that
 * is the correct experience of a permission they do not hold.
 *
 * Absent on purpose: editing the catalogue. A competition is a registered
 * content type, so its copy is edited at `/site/content/competition/:id` by the
 * CMS editor that already exists. A second edit path here would be the second
 * source of truth doc 13 §12.8 exists to remove, in miniature.
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

export const createCompetition = (body: {
  name: string;
  registrationDeadline: string;
  level?: string;
  format?: string;
  mode?: string;
  levels?: string[];
}) => send<{ id: string; slug: string }>('/competitions', 'POST', body);

// ── roster (`student.edit`) ─────────────────────────────────────────────

export const addParticipant = (competitionId: string, studentId: string) =>
  send<{ id: string }>(`/competitions/${competitionId}/targets`, 'POST', { studentId });

export const removeParticipant = (competitionId: string, targetId: string) =>
  send(`/competitions/${competitionId}/targets/${targetId}`, 'DELETE');

export const createTeam = (
  competitionId: string,
  body: { name: string; mentorId?: string | null },
) => send<{ id: string }>(`/competitions/${competitionId}/teams`, 'POST', body);

export const deleteTeam = (competitionId: string, teamId: string) =>
  send(`/competitions/${competitionId}/teams/${teamId}`, 'DELETE');

export const addTeamMember = (
  competitionId: string,
  teamId: string,
  body: { studentId: string; role: 'LEADER' | 'MEMBER' },
) => send(`/competitions/${competitionId}/teams/${teamId}/members`, 'POST', body);

export const removeTeamMember = (competitionId: string, teamId: string, studentId: string) =>
  send(`/competitions/${competitionId}/teams/${teamId}/members/${studentId}`, 'DELETE');

// ── outcome (`progress.edit`) ───────────────────────────────────────────

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
