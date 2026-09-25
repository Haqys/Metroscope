import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send a password-reset email.
 *
 * Always reports success, an endpoint that says "no such account" is a
 * membership oracle, and here membership means "this family's child attends
 * Metroscope". The email is sent or it is not; the response does not say which.
 */
const Body = z.object({ email: z.string().email() }).strict();

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
      { error: { code: 'VALIDATION_FAILED', message: 'Masukkan email yang valid.' } },
      { status: 422 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });

  if (error) {
    logger.warn('reset_send_suppressed', { reason: error.message });
  }

  return NextResponse.json({ data: { sent: true } }, { headers: { 'cache-control': 'no-store' } });
}
