import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateUserStatus } from '@/modules/users/users.schema';
import { setUserStatus } from '@/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deactivate or reinstate an account. There is no delete, see users.service. */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'user.manage',
    body: UpdateUserStatus,
    audit: 'user.status',
    rateLimit: { key: 'users.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await setUserStatus(ctx, uuidParam(params), body)),
);
