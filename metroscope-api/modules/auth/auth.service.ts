import { sql } from 'drizzle-orm';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';
import { logger } from '@/lib/logger';
import { resolveGrants } from '@/lib/auth/grants';
import { asUser } from '@/lib/db/rls';
import type { RequestContext } from '@/lib/auth/context';
import type { LoginInput, RefreshInput, RequestResetInput, RequestOtpInput } from './auth.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Authentication against Supabase Auth (GoTrue).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Called with the ANON key, never the service role. These endpoints act on
 * behalf of whoever is at the keyboard, and GoTrue applies its own brute-force
 * protection to anon-key traffic. Using the service role here would both
 * bypass that and mean a bug in this file could mint a session for anyone.
 *
 * Tokens are returned to the caller, which is always one of our own BFF hops,
 * never a browser (doc 04 §0.4). The BFF is what puts them in HttpOnly cookies;
 * this service never sets a cookie itself, because it has no idea which
 * surface's cookie domain applies.
 */

const AUTH_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;

interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string };
}

async function gotrue<T>(
  path: string,
  // Omit, not intersect: an intersection would keep RequestInit's own `body`
  // and require the value to satisfy BodyInit as well.
  init: Omit<RequestInit, 'body'> & { body?: unknown },
  ctx: RequestContext,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}${path}`, {
      method: init.method ?? 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Auth must never be served from a cache, at any layer.
      cache: 'no-store',
    });
  } catch (err) {
    /**
     * Transport failure, not an authentication decision. Letting this fall
     * through would surface as a generic 500 and, worse, read as "wrong
     * password" to anyone mapping errors by feel. 502 says the truth: we could
     * not reach the identity provider.
     */
    const cause = err instanceof Error ? (err.cause as { code?: string } | undefined) : undefined;
    logger.error('auth_upstream_unreachable', {
      path,
      requestId: ctx.requestId,
      code: cause?.code,
      message: err instanceof Error ? err.message : String(err),
    });
    throw new ApiError(502, 'AUTH_UPSTREAM_ERROR', 'Layanan autentikasi tidak dapat dihubungi.');
  }

  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};

  if (!res.ok) {
    /**
     * GoTrue's message is for developers, not end users, and can disclose
     * whether an address is registered. Log the detail; return a generic
     * Indonesian message.
     */
    logger.warn('auth_upstream_rejected', {
      path,
      status: res.status,
      requestId: ctx.requestId,
      upstream: payload.error_description ?? payload.msg ?? payload.error,
    });

    if (res.status === 400 || res.status === 401) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.');
    }
    if (res.status === 422) {
      throw new ApiError(422, 'VALIDATION_FAILED', 'Data yang dikirim tidak valid.');
    }
    if (res.status === 429) {
      throw new ApiError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi nanti.');
    }
    throw new ApiError(502, 'AUTH_UPSTREAM_ERROR', 'Layanan autentikasi sedang bermasalah.');
  }

  return payload as T;
}

/** Shape returned to the BFF. Deliberately not the raw GoTrue payload. */
function sessionResponse(session: GoTrueSession) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}

export async function login(ctx: RequestContext, input: LoginInput) {
  const session = await gotrue<GoTrueSession>(
    '/token?grant_type=password',
    { body: { email: input.email, password: input.password } },
    ctx,
  );

  /**
   * A valid password is not the same as a usable account. Somebody whose access
   * was revoked still authenticates against GoTrue, the grants are what decide
   * whether there is anything to sign in TO.
   */
  const grants = await resolveGrants(session.user.id);

  logger.info('auth_login', {
    userId: session.user.id,
    roles: grants.roles,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return { ...sessionResponse(session), ...grants };
}

export async function refresh(ctx: RequestContext, input: RefreshInput) {
  const session = await gotrue<GoTrueSession>(
    '/token?grant_type=refresh_token',
    { body: { refresh_token: input.refreshToken } },
    ctx,
  );
  return sessionResponse(session);
}

export async function logout(ctx: RequestContext, accessToken: string) {
  await gotrue<unknown>('/logout', { headers: { Authorization: `Bearer ${accessToken}` } }, ctx);
  logger.info('auth_logout', { userId: ctx.user?.id, requestId: ctx.requestId });
  return { ok: true };
}

/**
 * Both of these ALWAYS report success.
 *
 * Telling an anonymous caller "no account with that email" turns the endpoint
 * into a membership oracle, and for a service whose users are the parents of
 * identifiable schoolchildren, confirming a family is enrolled is itself a
 * disclosure. The email is sent or it is not; the response does not say which.
 */
export async function requestPasswordReset(ctx: RequestContext, input: RequestResetInput) {
  try {
    await gotrue<unknown>('/recover', { body: { email: input.email } }, ctx);
  } catch (err) {
    logger.warn('auth_reset_suppressed', {
      requestId: ctx.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return { sent: true };
}

export async function requestOtp(ctx: RequestContext, input: RequestOtpInput) {
  try {
    await gotrue<unknown>('/otp', { body: { email: input.email, create_user: false } }, ctx);
  } catch (err) {
    logger.warn('auth_otp_suppressed', {
      requestId: ctx.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return { sent: true };
}

/**
 * GET /v1/auth/me, the single source every surface reads identity from.
 *
 * Returns the profile alongside the grants so a frontend needs exactly one
 * request to render its shell: name and avatar for the header, pages for the
 * nav, actions to decide which buttons are real.
 */
export async function me(ctx: RequestContext) {
  if (!ctx.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak ditemukan.');
  }

  const profile = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{
      full_name: string;
      display_name: string | null;
      photo_url: string | null;
      phone: string | null;
      status: string;
    }>(sql`
      SELECT full_name, display_name, photo_url, phone, status
      FROM users WHERE id = ${ctx.user!.id}
    `);
    return rows[0] ?? null;
  });

  /**
   * A token for a user with no users row means provisioning failed halfway.
   * Failing loudly here beats every downstream surface rendering a nameless
   * account and each inventing its own fallback.
   */
  if (!profile) {
    throw new ApiError(403, 'ACCOUNT_NOT_PROVISIONED', 'Akun belum aktif. Hubungi admin.');
  }
  if (profile.status !== 'ACTIVE') {
    throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Akun kamu sedang tidak aktif.');
  }

  return {
    id: ctx.user.id,
    email: ctx.user.email ?? null,
    phone: profile.phone,
    fullName: profile.full_name,
    displayName: profile.display_name,
    photoUrl: profile.photo_url,
    roles: ctx.roles,
    /**
     * Role display data, name, landing page, chip colour, so a shell never
     * has to keep its own copy of the role table to render a chip. A custom
     * role the Head invented resolves here exactly like a seeded one.
     */
    roleDetails: ctx.roleDetails,
    actions: ctx.actions,
    pages: ctx.pages,
    primaryRole: ctx.primaryRole,
  };
}
