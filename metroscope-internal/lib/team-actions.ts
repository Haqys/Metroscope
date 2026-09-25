'use client';

/**
 * Role and account administration, from the browser via the BFF.
 *
 * Nothing here decides anything: `role.manage` is checked by the API and again
 * by RLS (`roles_write`, `role_actions_write`, `user_roles_write`). A 403 is an
 * answer to render, not a branch to route around.
 */
export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function send<T>(
  path: string,
  method: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<ActionResult<T>> {
  try {
    const res = await fetch(`/api/bff${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: T;
      error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
    } | null;

    if (res.ok) return { ok: true, data: payload?.data };

    // The first Zod issue is more useful than the generic envelope message,
    // "Tentukan halaman utama" beats "Data yang dikirim tidak valid".
    const issue = payload?.error?.details?.issues?.[0]?.message;
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

export interface RoleInput {
  code?: string;
  name?: string;
  description?: string | null;
  home?: string;
  tone?: string;
  pages?: string[];
  actions?: string[];
}

export const createRole = (input: RoleInput) => send('/roles', 'POST', input);
export const updateRole = (id: string, input: RoleInput) => send(`/roles/${id}`, 'PATCH', input);
export const deleteRole = (id: string) => send(`/roles/${id}`, 'DELETE');

export interface NewUser {
  fullName: string;
  displayName?: string;
  email: string;
  phone?: string;
  roles: string[];
  primaryRole: string;
}

/**
 * Invite a colleague. `key` must be STABLE for the mounted form.
 *
 * A key regenerated per click would satisfy the required header and defeat what
 * it is for: a double-submit would create a second auth account that takes the
 * email, leaving the first one permanently unreachable.
 */
export const createUser = (input: NewUser, key: string) =>
  send('/users', 'POST', input, { 'Idempotency-Key': key });

export const setUserRoles = (id: string, roles: string[], primaryRole: string) =>
  send(`/users/${id}/roles`, 'PUT', { roles, primaryRole });

export const setUserStatus = (id: string, status: 'ACTIVE' | 'INACTIVE') =>
  send(`/users/${id}/status`, 'PATCH', { status });
