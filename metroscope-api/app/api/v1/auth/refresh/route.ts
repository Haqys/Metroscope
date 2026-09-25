import { handler, ok } from '@/lib/http/handler';
import { Refresh } from '@/modules/auth/auth.schema';
import { refresh } from '@/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchange a refresh token for a new session.
 *
 * `auth: 'public'` because the caller's access token is by definition expired
 * at this point, the refresh token IS the credential, and GoTrue validates it.
 * Supabase rotates refresh tokens and detects reuse of a spent one, which is
 * what turns a stolen token into a detectable event rather than a silent one.
 */
export const POST = handler(
  {
    auth: 'public',
    body: Refresh,
    rateLimit: { key: 'auth.refresh', limit: 60, window: '15 m' },
  },
  async ({ ctx, body }) => ok(await refresh(ctx, body)),
);
