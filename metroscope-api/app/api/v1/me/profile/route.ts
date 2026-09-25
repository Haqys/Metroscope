import { handler, ok } from '@/lib/http/handler';
import { UpdateProfile } from '@/modules/me/me.schema';
import { getProfile, updateProfile } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The caller's own profile.
 *
 * No `action` and no `page` guard: every signed-in account owns its profile,
 * whatever role it holds, and `users_update_self` is the gate. A verb here
 * would have to be granted to all six roles to mean anything, which is a verb
 * that says nothing.
 */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'me.profile', limit: 120, window: '1 m' } },
  async ({ ctx }) => ok(await getProfile(ctx)),
);

export const PATCH = handler(
  {
    auth: 'required',
    body: UpdateProfile,
    /** The caller is changing their OWN row; users_update_self is the gate. */
    ownerWrite: true,
    audit: 'profile.update',
    rateLimit: { key: 'me.profile.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await updateProfile(ctx, body)),
);
