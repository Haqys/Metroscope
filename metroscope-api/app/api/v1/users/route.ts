import { handler, ok } from '@/lib/http/handler';
import { CreateUser, ListUsersQuery } from '@/modules/users/users.schema';
import { createUser, listUsers } from '@/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The team directory.
 *
 * No action verb, `users_select` decides the rows, and it distinguishes three
 * grounds: yourself, the staff directory (colleagues, for any staff account),
 * and everyone (for `user.manage`). A Mentor therefore gets colleagues and no
 * guardians, without this route needing to know the difference.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/team',
    query: ListUsersQuery,
    rateLimit: { key: 'users.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listUsers(ctx, query)),
);

/**
 * Invite a colleague. `user.manage`, and idempotent by Idempotency-Key.
 *
 * A double-submitted form must not create two auth accounts for one person,
 * the second would take the email, and the first would be unreachable.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'user.manage',
    body: CreateUser,
    idempotent: true,
    audit: 'user.create',
    rateLimit: { key: 'users.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createUser(ctx, body), { status: 201 }),
);
