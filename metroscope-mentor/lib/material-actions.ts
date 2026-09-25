'use client';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Material authoring, from the browser via the BFF (doc 14 §3.3).
 *
 * Nothing here decides anything. `material.manage` is checked by the API and
 * again by RLS (`materials_write`, `material_resources_write`,
 * `material_assignments_write`). A 403 is an answer to render.
 *
 * Absent on purpose: writing `material_progress`. That is the FAMILY's write,
 * `material_progress_write` refuses staff outright, because a mentor marking a
 * module finished on a student's behalf would make the engagement number
 * describe the staff rather than the students.
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

export const createMaterial = (body: { title: string; description?: string | null }) =>
  send<{ id: string; slug: string }>('/materials', 'POST', body);

export const updateMaterial = (id: string, body: Record<string, unknown>) =>
  send(`/materials/${id}`, 'PATCH', body);

export const setMaterialStatus = (id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') =>
  send(`/materials/${id}/status`, 'POST', { status });

export const addResource = (
  id: string,
  body: { kind: string; title: string; url: string; durationMin?: number | null },
) => send(`/materials/${id}/resources`, 'POST', body);

export const removeResource = (id: string, resourceId: string) =>
  send(`/materials/${id}/resources/${resourceId}`, 'DELETE');

export const assignMaterial = (
  id: string,
  body: { studentId?: string; programId?: string; level?: string },
) => send(`/materials/${id}/assignments`, 'POST', body);

export const unassignMaterial = (id: string, assignmentId: string) =>
  send(`/materials/${id}/assignments/${assignmentId}`, 'DELETE');

export interface AssignmentRow {
  id: string;
  studentId: string | null;
  programId: string | null;
  level: string | null;
  studentName: string | null;
  programName: string | null;
}

/** Who currently has this module. Fetched when the dialog opens, see internal. */
export const fetchAssignments = (id: string) =>
  send<{ items: AssignmentRow[] }>(`/materials/${id}/assignments`, 'GET');
