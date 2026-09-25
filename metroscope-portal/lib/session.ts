import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/**
 * Single source for "who is signed in".
 *
 * Reads GET /v1/auth/me, which returns identity AND grants. Grants are resolved
 * from the database on every request rather than read out of the token, so
 * removing someone's role takes effect on their next page load instead of at
 * token expiry (see metroscope-api/lib/auth/grants.ts).
 *
 * `cache()` dedupes this within one render pass, the shell, the nav and a page
 * can each ask for the session and it costs one request.
 */
export interface Session {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  displayName?: string | null;
  photoUrl?: string | null;
  /**
   * Empty for customers. Roles are a staff concept, a parent's account has a
   * `students` row and no `user_roles` entry (see app/portal/layout.tsx).
   */
  roles: string[];
  primaryRole: string | null;
  /** Action verbs the caller holds. Use to decide whether a button is real. */
  actions: string[];
  /** Page grants. Drive navigation only, never treat as permission to write. */
  pages: string[];
}

export const getSession = cache(async (): Promise<Session | null> => {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`${env.API_URL}/v1/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) return null;

  const { data } = await res.json();
  return {
    id: data.id,
    email: data.email,
    phone: data.phone ?? null,
    roles: data.roles ?? [],
    primaryRole: data.primaryRole ?? data.roles?.[0] ?? null,
    fullName: data.fullName,
    displayName: data.displayName,
    photoUrl: data.photoUrl,
    actions: data.actions ?? [],
    pages: data.pages ?? [],
  };
});

/**
 * Session or bust. Middleware already redirected anonymous visitors, so
 * reaching here without one means the token expired mid-render or the account
 * was deactivated. Both should send the person back to the door.
 */
export const requireSession = async (): Promise<Session> => {
  const session = await getSession();
  if (!session) {
    redirect(process.env.LOGIN_URL ?? 'http://localhost:3004/login');
  }
  return session;
};
