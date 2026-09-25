import { handler, ok } from '@/lib/http/handler';
import { RequestOtp } from '@/modules/auth/auth.schema';
import { requestOtp } from '@/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Email a one-time sign-in link.
 *
 * The parent-facing path: a guardian who has paid once a month for a year does
 * not remember a password. `create_user: false` in the service means this can
 * only ever reach an account that already exists. It is a sign-in route, not a
 * back door around conversion.
 *
 * Like /reset, always reports success and never reveals whether the address is
 * registered.
 */
export const POST = handler(
  {
    auth: 'public',
    body: RequestOtp,
    rateLimit: { key: 'auth.otp', limit: 5, window: '1 h' },
  },
  async ({ ctx, body }) => ok(await requestOtp(ctx, body)),
);
