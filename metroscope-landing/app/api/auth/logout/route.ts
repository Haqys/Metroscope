import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sign out.
 *
 * signOut() revokes the session with GoTrue and clears the cookies through the
 * same SSR client that set them, so the token is dead server-side, not merely
 * forgotten by this browser. Every surface shares the cookie domain, so one
 * call signs the person out of all four.
 */
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

  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.json({ data: { ok: true } }, { headers: { 'cache-control': 'no-store' } });
}
