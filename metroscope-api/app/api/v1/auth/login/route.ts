import { handler, ok } from '@/lib/http/handler';
import { Login } from '@/modules/auth/auth.schema';
import { login } from '@/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One door for every role (doc 03 FR-AC-3), parents, mentors and staff all
 * sign in here, and the grants in the response decide where they land.
 *
 * Rate limited hard and by IP. GoTrue applies its own per-account throttle;
 * this one exists for the other direction, a single source trying many
 * accounts, which per-account limits never see.
 */
export const POST = handler(
  {
    auth: 'public',
    body: Login,
    rateLimit: { key: 'auth.login', limit: 10, window: '15 m' },
  },
  async ({ ctx, body }) => ok(await login(ctx, body)),
);
