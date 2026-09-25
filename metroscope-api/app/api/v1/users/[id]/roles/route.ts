import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateUserRoles } from '@/modules/users/users.schema';
import { setUserRoles } from '@/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Assign roles. Gated on `role.manage`, not `user.manage`.
 *
 * Editing somebody's profile and deciding what they may do are different powers:
 * `user.manage` can fix a misspelled name, `role.manage` can hand out
 * payment.verify. RLS agrees, `user_roles_write` requires `role.manage`.
 */
export const PUT = handler(
  {
    auth: 'required',
    action: 'role.manage',
    body: UpdateUserRoles,
    audit: 'user.roles',
    rateLimit: { key: 'users.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await setUserRoles(ctx, uuidParam(params), body)),
);
