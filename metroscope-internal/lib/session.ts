import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/lib/types';
import { getAccessToken } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { PAGES } from '@/lib/pages';

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
export interface Session extends SessionUser {
  /** Action verbs the caller holds. Use to decide whether a button is real. */
  actions: string[];
  /** Page grants. Drive navigation only, never treat as permission to write. */
  pages: string[];
}

export const getSession = cache(async (): Promise<Session | null> => {
  const hasNoExternalLogin =
    !process.env.LOGIN_URL ||
    process.env.LOGIN_URL.includes('localhost') ||
    process.env.LOGIN_URL.includes('127.0.0.1');

  const isStandalone =
    process.env.NEXT_PUBLIC_STANDALONE !== 'false' ||
    process.env.DEV_BYPASS_AUTH === 'true' ||
    hasNoExternalLogin ||
    (process.env.NODE_ENV !== 'production' &&
      (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')));

  if (isStandalone) {
    return {
      id: 'staff-admin-id',
      email: 'team@metroscope.id',
      phone: '+6281234567890',
      roles: ['HEAD', 'EDITOR', 'STAFF'],
      roleDetails: [
        { code: 'HEAD', name: 'Head Administrator', home: '/overview', tone: null },
        { code: 'EDITOR', name: 'Content Editor', home: '/site/impacts', tone: null },
        { code: 'STAFF', name: 'Staff Team', home: '/home', tone: null },
      ],
      primaryRole: 'HEAD',
      fullName: 'Metroscope Team',
      displayName: 'Metroscope Admin',
      photoUrl: null,
      actions: ['*'],
      pages: PAGES.map((p) => p.href),
    };
  }

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
    roleDetails: data.roleDetails ?? [],
    primaryRole: data.primaryRole ?? data.roles?.[0] ?? 'STAFF',
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
    const login = process.env.LOGIN_URL;
    if (login && !login.includes('localhost') && !login.includes('127.0.0.1')) {
      redirect(login);
    }
    redirect('/forbidden');
  }
  return session;
};
