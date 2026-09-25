import { handler, ok } from '@/lib/http/handler';
import { CreateRole } from '@/modules/roles/roles.schema';
import { createRole, listRoles } from '@/modules/roles/roles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every role, with its pages and verbs.
 *
 * Readable by any signed-in account (`roles_select USING (true)`), because the
 * shell has to resolve role names and colours to render a chip, and /team has
 * to list assignable roles. Role rows carry no secrets, the sensitive part is
 * who HOLDS them, which `user_roles` gates separately.
 */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'roles.list', limit: 120, window: '1 m' } },
  async ({ ctx }) => ok(await listRoles(ctx)),
);

export const POST = handler(
  {
    auth: 'required',
    action: 'role.manage',
    body: CreateRole,
    audit: 'role.create',
    rateLimit: { key: 'roles.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createRole(ctx, body), { status: 201 }),
);
