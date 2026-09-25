import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Email a one-time code.
 *
 * The parent-facing path: a guardian who pays once a month for a year does not
 * remember a password. Email only. There is no SMS or WhatsApp channel
 * (removed 2026-07-29, doc 08 §4).
 *
 * `shouldCreateUser: false` matters. Without it this endpoint would provision
 * an account for any address typed into it, bypassing the entire lead →
 * consultation → conversion flow that is supposed to create accounts.
 *
 * Always reports success: telling an anonymous caller whether an address is
 * registered would confirm that a particular family is enrolled here.
 */
const Body = z.object({ email: z.string().email('Masukkan email yang valid') }).strict();

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
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    logger.warn('otp_send_suppressed', { reason: error.message });
  }

  return NextResponse.json({ data: { sent: true } }, { headers: { 'cache-control': 'no-store' } });
}
