import { handler, ok } from '@/lib/http/handler';
import { me } from '@/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Identity + grants for the signed-in caller.
 *
 * Every surface reads its shell from here, name in the header, `pages` for the
 * nav, `actions` to decide which buttons are real rather than decorative. That
 * is also why grants are resolved per request from the database: a role change
 * takes effect on the next page load, not at token expiry.
 */
export const GET = handler({ auth: 'required' }, async ({ ctx }) => ok(await me(ctx)));
