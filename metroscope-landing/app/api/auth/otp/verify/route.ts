import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchange a one-time code for a session.
 *
 * Same outcome as /api/auth/login: cookies set server-side, only a destination
 * returned. GoTrue enforces the code's single use and expiry. This route must
 * not add its own "attempts remaining" logic, which would leak whether the
 * address exists.
 */
const Body = z
  .object({
    email: z.string().email(),
    token: z.string().regex(/^\d{6}$/, 'Kode OTP terdiri dari 6 angka'),
    next: z.string().optional(),
  })
  .strict();

const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:3001';
const INTERNAL_URL = process.env.INTERNAL_URL ?? 'http://localhost:3002';
const MENTOR_URL = process.env.MENTOR_URL ?? 'http://localhost:3003';

const HOME_BY_ROLE: Record<string, string> = {
  HEAD: INTERNAL_URL,
  SECRETARY: INTERNAL_URL,
  FINANCE: INTERNAL_URL,
  EDITOR: INTERNAL_URL,
  MENTOR: MENTOR_URL,
};

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
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  });

  if (error || !data.session) {
    logger.warn('otp_verify_rejected', { requestId, reason: error?.message });
    return NextResponse.json(
      { error: { code: 'INVALID_OTP', message: 'Kode salah atau sudah kedaluwarsa.' } },
      { status: 401 },
    );
  }

  let destination = parsed.data.next ?? null;
  if (!destination) {
    try {
      const meRes = await fetch(`${env.API_URL}/v1/auth/me`, {
        headers: { authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store',
      });
      const me = meRes.ok ? await meRes.json() : null;
      const roles: string[] = me?.data?.roles ?? [];
      destination = roles.map((r) => HOME_BY_ROLE[r]).find(Boolean) ?? PORTAL_URL;
    } catch {
      destination = PORTAL_URL;
    }
  }

  return NextResponse.json(
    { data: { next: destination } },
    { headers: { 'cache-control': 'private, no-store', 'x-request-id': requestId } },
  );
}
