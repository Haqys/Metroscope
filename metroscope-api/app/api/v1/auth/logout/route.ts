import { handler, ok } from '@/lib/http/handler';
import { logout } from '@/modules/auth/auth.service';
import { ApiError } from '@/lib/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Revoke the session server-side.
 *
 * Clearing the cookie is the BFF's job; this makes the token itself worthless,
 * which is the part that matters if it has already been copied. No action grant,
 * ending your own session is not an authorised operation, it is the absence
 * of one.
 */
export const POST = handler(
  {
    auth: 'required',
    rateLimit: { key: 'auth.logout', limit: 30, window: '15 m' },
  },
  async ({ req, ctx }) => {
    const authz = req.headers.get('authorization');
    if (!authz?.startsWith('Bearer ')) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak ditemukan.');
    }
    return ok(await logout(ctx, authz.slice(7)));
  },
);
