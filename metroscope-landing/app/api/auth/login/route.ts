import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign in, server-side.
 *
 * The browser posts here, same origin, and gets back only a destination. The
 * access and refresh tokens are written straight into HttpOnly cookies scoped
 * to COOKIE_DOMAIN by the SSR client, so they authenticate all four surfaces
 * without ever being readable from JavaScript (doc 04 §0.4).
 *
 * Credentials go to GoTrue; AUTHORISATION does not come from here. The response
 * carries `next` only, and each surface asks GET /v1/auth/me what the caller may
 * actually do, grants live in the database, not in the token (doc 14 §0.3).
 */
const Body = z
  .object({
    email: z.string().email('Masukkan email yang valid'),
    password: z.string().min(1, 'Kata sandi wajib diisi'),
    next: z.string().optional(),
  })
  .strict();

const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:3001';
const INTERNAL_URL = process.env.INTERNAL_URL ?? 'http://localhost:3002';
const MENTOR_URL = process.env.MENTOR_URL ?? 'http://localhost:3003';

/**
 * Which DEPLOYMENT serves a role, and in what order to prefer them.
 *
 * Only the origin is decided here. The PATH comes from `roles.home` in the
 * database, which every surface already reads through `/v1/auth/me`
 * (`roleDetails[].home`), so a custom role the Head invents lands correctly
 * without a code change (doc 12 §10.1: roles are data, not an enum).
 *
 * Which of the four apps hosts a role genuinely is code: `roles` has no column
 * naming a deployment, and inventing one would put a URL in a table that no
 * migration can keep in step with Vercel.
 *
 * Ordered, because an account can hold several roles. The Head holds HEAD and
 * lands on the internal dashboard, not wherever the alphabet puts them.
 */
const APP_BY_ROLE: Record<string, string> = {
  HEAD: INTERNAL_URL,
  SECRETARY: INTERNAL_URL,
  FINANCE: INTERNAL_URL,
  EDITOR: INTERNAL_URL,
  MENTOR: MENTOR_URL,
  PARENT: PORTAL_URL,
};

const ROLE_PRIORITY = ['HEAD', 'SECRETARY', 'FINANCE', 'EDITOR', 'MENTOR', 'PARENT'];

/**
 * Where a customer goes when they hold no role at all.
 *
 * A guardian's `user_roles` row is optional by design: the conversion
 * transaction creates the account with a `students` row and nothing else, and
 * `app/portal/layout.tsx` admits any signed-in account for exactly that
 * reason. `/portal` and not `/`: the portal has no root page, so sending them
 * to the bare origin is a 404 with a valid session behind it, which is the
 * shape of the bug this whole route is here to fix.
 */
const CUSTOMER_FALLBACK = `${PORTAL_URL}/portal`;

interface RoleDetail {
  code: string;
  home: string;
}

/**
 * Which surfaces a role is allowed to be SENT to after login.
 *
 * This is not an authorisation decision, the API still gates every byte. It is
 * a routing one, and it fixes a real dead end: the internal app bounces an
 * unauthenticated visitor to `/login?next=<internal url>`, so a student who
 * followed a stale link, a bookmark, or a colleague's URL signed in
 * successfully and was then delivered straight back to a page their role
 * cannot open. The session was fine. The destination was never theirs.
 *
 * Landing is in every set: it is the public site and belongs to everyone.
 */
const ALLOWED_ORIGINS_BY_ROLE: Record<string, string[]> = {
  HEAD: [INTERNAL_URL, PORTAL_URL, MENTOR_URL],
  SECRETARY: [INTERNAL_URL],
  FINANCE: [INTERNAL_URL],
  EDITOR: [INTERNAL_URL],
  MENTOR: [MENTOR_URL],
  PARENT: [PORTAL_URL],
};

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * The landing URL for this account: the app that serves their role, plus the
 * path that role's own row names.
 */
function homeFor(roles: string[], roleDetails: RoleDetail[], primaryRole: string | null): string {
  const ordered = [
    ...(primaryRole ? [primaryRole] : []),
    ...ROLE_PRIORITY.filter((r) => roles.includes(r)),
    ...roles,
  ];
  const code = ordered.find((r) => APP_BY_ROLE[r]);
  if (!code) return CUSTOMER_FALLBACK;

  const origin = APP_BY_ROLE[code];
  const path = roleDetails.find((d) => d.code === code)?.home ?? '/';

  /** `roles.home` is a path. A row holding an absolute URL is not a redirect target. */
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/';
  return `${origin}${safePath}`;
}

/**
 * The destination, decided by the caller's ROLES rather than by whatever the
 * query string asked for.
 *
 * `next` used to be honoured verbatim. That was also an open redirect: any
 * absolute URL in the query string became the response's `next`, and the
 * browser followed it. Both problems have the same fix, which is to treat
 * `next` as a request rather than an instruction.
 */
function resolveDestination(
  roles: string[],
  roleDetails: RoleDetail[],
  primaryRole: string | null,
  next: string | null,
): string {
  const home = homeFor(roles, roleDetails, primaryRole);
  if (!next) return home;

  /** A relative path stays on the landing site, which everybody may see. */
  if (next.startsWith('/') && !next.startsWith('//')) return next;

  const target = originOf(next);
  if (!target) return home;

  const permitted = new Set(
    roles.flatMap((r) => ALLOWED_ORIGINS_BY_ROLE[r] ?? []).map((u) => originOf(u) ?? ''),
  );
  permitted.add(originOf(env.NEXT_PUBLIC_SITE_URL) ?? '');

  return permitted.has(target) ? next : home;
}

export async function POST(req: NextRequest) {
  /**
   * No sign-in without the portal to sign in to. `/login` is not rendered in
   * standalone and the navbar link is gone, so this is only reachable by a
   * direct POST; it answers plainly rather than authenticating somebody into
   * an application that is not deployed.
   */
  if (STANDALONE) {
    return NextResponse.json(
      {
        error: {
          code: 'STANDALONE_PREVIEW',
          message: 'Portal siswa belum aktif. Hubungi tim Metroscope untuk informasi akun.',
        },
      },
      { status: 503 },
    );
  }
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  /**
   * CSRF: this endpoint sets a session cookie, so it must only be reachable
   * from this origin. Same check as the BFF proxy in the other three apps.
   */
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.nextUrl.host) {
    return NextResponse.json(
      { error: { code: 'CROSS_ORIGIN_FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Data tidak valid.',
        },
      },
      { status: 422 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session) {
    /**
     * Separate "we could not ask" from "the answer was no".
     *
     * supabase-js reports a transport failure as an AuthRetryableFetchError with
     * status 0. Collapsing that into 401 tells someone their password is wrong
     * when the real problem is that Supabase is unreachable. They then change a
     * password that was never the issue, and the outage stays invisible.
     */
    const unreachable = error?.name === 'AuthRetryableFetchError' || error?.status === 0;

    logger.warn(unreachable ? 'login_upstream_unreachable' : 'login_rejected', {
      requestId,
      reason: error?.message,
    });

    if (unreachable) {
      return NextResponse.json(
        {
          error: {
            code: 'AUTH_UPSTREAM_ERROR',
            message: 'Layanan masuk sedang bermasalah. Coba lagi sebentar lagi.',
          },
        },
        { status: 503 },
      );
    }

    // Never distinguish "no such account" from "wrong password".
    return NextResponse.json(
      { error: { code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah.' } },
      { status: 401 },
    );
  }

  /**
   * Ask the API who this is, ALWAYS. Roles are not in the token by design, and
   * the answer is needed even when `next` was supplied: a requested
   * destination has to be checked against the role before it is honoured.
   */
  const requestedNext = parsed.data.next ?? null;
  let destination: string | null = null;
  {
    try {
      const meRes = await fetch(`${env.API_URL}/v1/auth/me`, {
        headers: { authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store',
      });
      if (meRes.ok) {
        const me = await meRes.json();
        const roles: string[] = me.data?.roles ?? [];
        const roleDetails: RoleDetail[] = me.data?.roleDetails ?? [];
        destination = resolveDestination(
          roles,
          roleDetails,
          me.data?.primaryRole ?? null,
          requestedNext,
        );
      } else {
        /**
         * Authenticated but not provisioned, deactivated, or the API is having
         * a bad time. The surfaces show the real reason; sending them to the
         * portal keeps this route dumb, but log the status, because silently
         * routing every staff member to the customer portal looks like a
         * routing bug and is really an upstream one.
         */
        logger.warn('login_me_lookup_rejected', { requestId, status: meRes.status });
        destination = CUSTOMER_FALLBACK;
      }
    } catch (err) {
      logger.error('login_me_lookup_failed', {
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
      destination = CUSTOMER_FALLBACK;
    }
  }

  logger.info('login_ok', { requestId, userId: data.session.user.id });

  return NextResponse.json(
    { data: { next: destination } },
    { headers: { 'cache-control': 'private, no-store', 'x-request-id': requestId } },
  );
}
