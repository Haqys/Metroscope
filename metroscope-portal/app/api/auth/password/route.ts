import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSsrClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Change your own password.
 *
 * The security page had this form with `TODO: POST /auth/reset` above a handler
 * that validated the three fields, cleared them and showed "Password
 * diperbarui". Nothing was sent anywhere. Somebody who believed it had rotated
 * a compromised password still had the old one.
 *
 * Server-side and same-origin, like the login route it mirrors: the session
 * lives in HttpOnly cookies that browser JavaScript cannot read, so the
 * exchange has to happen here.
 *
 * ── Why the current password is verified ──
 *
 * GoTrue's `updateUser({ password })` authorises on the SESSION alone. Without
 * the check below, anyone with a borrowed laptop and an open tab could set a
 * new password without knowing the old one and lock the owner out of their own
 * account. The re-authentication is done on a THROWAWAY client with no cookie
 * adapter, so a wrong guess cannot disturb the session that is already open,
 * which is what would happen if the request client were reused.
 */
const Body = z
  .object({
    currentPassword: z.string().min(1, 'Isi password saat ini.'),
    newPassword: z
      .string()
      .min(8, 'Password baru minimal 8 karakter.')
      .max(72, 'Password maksimal 72 karakter.'),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sesi tidak ditemukan. Masuk lagi.' } },
      { status: 401 },
    );
  }

  /** A separate client, so a failed guess cannot touch the live session. */
  const probe = createSsrClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: reauthError } = await probe.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (reauthError) {
    logger.warn('password_change_reauth_failed', { requestId, userId: user.id });
    return NextResponse.json(
      { error: { code: 'INVALID_CREDENTIALS', message: 'Password saat ini salah.' } },
      { status: 401 },
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    logger.warn('password_change_rejected', { requestId, userId: user.id, reason: error.message });
    /**
     * GoTrue refuses a new password equal to the old one, and refuses one that
     * fails the project's strength policy. Both are the caller's to fix, so
     * neither is a 500, and its own message is more specific than anything
     * that could be written here.
     */
    return NextResponse.json(
      { error: { code: 'PASSWORD_REJECTED', message: error.message } },
      { status: 400 },
    );
  }

  logger.info('password_changed', { requestId, userId: user.id });
  return NextResponse.json({ data: { ok: true } }, { headers: { 'cache-control': 'no-store' } });
}
