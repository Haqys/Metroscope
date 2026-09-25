import { handler, ok } from '@/lib/http/handler';
import { RequestReset } from '@/modules/auth/auth.schema';
import { requestPasswordReset } from '@/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send a password-reset email.
 *
 * Always responds `{ sent: true }`, whether or not the address exists, see
 * auth.service.ts. The rate limit is per IP and deliberately tight: this
 * endpoint sends mail on an anonymous caller's say-so, so it is both an
 * enumeration vector and a way to have Metroscope spam somebody.
 */
export const POST = handler(
  {
    auth: 'public',
    body: RequestReset,
    rateLimit: { key: 'auth.reset', limit: 5, window: '1 h' },
  },
  async ({ ctx, body }) => ok(await requestPasswordReset(ctx, body)),
);
