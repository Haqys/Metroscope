import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Server-side Supabase client bound to the request cookies.
 *
 * ANON key only. The service role key does not exist in this project,
 * privileged operations belong to the API service (doc 04 §6.3).
 *
 * Signing in happens on the SERVER, never in the browser, so the tokens land in
 * HttpOnly cookies and never touch browser JavaScript. That is the difference
 * between an XSS being a defacement and an XSS being account takeover
 * (doc 04 §3.2 / §0.4).
 */
export async function createClient() {
  const cookieStore = await cookies();

  /**
   * Standalone deploys have no Supabase project and no sign-in, so these two
   * are optional in `lib/env.ts`. Every caller is an auth route that refuses
   * before reaching this, so getting here means a route forgot to, and a named
   * error beats `createServerClient(undefined, undefined)` failing obscurely
   * several frames later.
   */
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured. This deployment is standalone ' +
        '(NEXT_PUBLIC_STANDALONE=true); auth routes must refuse before reaching this.',
    );
  }

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, {
              ...options,
              domain: env.COOKIE_DOMAIN,
              httpOnly: true,
              secure: env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            });
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
        }
      },
    },
  });
}
