import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Session refresh and the redirect to login.
 *
 * ⚠️ THIS IS ROUTING, NOT PERMISSION (doc 04 constraint 7, doc 15 §4).
 * It answers one question, "is anyone signed in?", and keeps the session
 * cookie fresh. It does NOT decide what they may see. Every protected byte is
 * authorised by api.metroscope.id, which assumes each request may arrive from
 * cURL bearing a valid token for the wrong role.
 *
 * It deliberately does not check roles. Grants live in user_roles/role_actions
 * and are resolved per request by the API (lib/auth/grants.ts), so they are not
 * in the token for middleware to read. That is what makes revoking a grant
 * take effect immediately instead of at token expiry. The surface-level "is
 * this person staff?" check belongs in the layout, which can call
 * GET /v1/auth/me; see app/(shell)/layout.tsx.
 */
const PUBLIC_PATHS = ['/forbidden', '/api/health'];

/**
 * Login lives on the landing site. One door for every role (doc 03 FR-AC-3).
 * The session cookie is scoped to COOKIE_DOMAIN, so signing in there
 * authenticates all four surfaces.
 */
function loginUrl(req: NextRequest, next: string) {
  const base = process.env.LOGIN_URL ?? 'http://localhost:3004/login';
  const url = new URL(base);
  url.searchParams.set('next', new URL(next, req.url).toString());
  return url;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) {
            res.cookies.set(name, value, {
              ...options,
              domain: process.env.COOKIE_DOMAIN,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            });
          }
        },
      },
    },
  );

  // getUser() revalidates with Supabase; getSession() alone would trust the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(loginUrl(req, pathname));

  res.headers.set('x-request-id', req.headers.get('x-request-id') ?? crypto.randomUUID());
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
