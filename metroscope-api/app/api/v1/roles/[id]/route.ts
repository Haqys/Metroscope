import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateRole } from '@/modules/roles/roles.schema';
import { deleteRole, updateRole } from '@/modules/roles/roles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handler(
  {
    auth: 'required',
    action: 'role.manage',
    body: UpdateRole,
    audit: 'role.update',
    rateLimit: { key: 'roles.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateRole(ctx, uuidParam(params), body)),
);

export const DELETE = handler(
  {
    auth: 'required',
    action: 'role.manage',
    audit: 'role.delete',
    rateLimit: { key: 'roles.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, params }) => {
    await deleteRole(ctx, uuidParam(params));
    return ok({ deleted: true });
  },
);
