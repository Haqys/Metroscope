import { handler, ok, uuidParam } from '@/lib/http/handler';
import { AssignMaterialBody } from '@/modules/materials/materials.schema';
import { assignMaterial, listAssignments } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who was given this module. Internal, never readable by a family. */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'materials.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await listAssignments(ctx, uuidParam(params))),
);

/**
 * Entitlement, at exactly one scope: a student, a programme, or a level.
 *
 * A programme-scoped assignment reaches students through `enrollments`, so a
 * child enrolling next month gets the back catalogue without anybody
 * reassigning anything.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: AssignMaterialBody,
    audit: 'material.assign',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await assignMaterial(ctx, uuidParam(params), body), { status: 201 }),
);
