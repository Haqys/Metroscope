import { handler, ok } from '@/lib/http/handler';
import { CreateMaterialBody, ListMaterialsQuery } from '@/modules/materials/materials.schema';
import { createMaterial, listMaterials } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The module library (doc 13 §12.7).
 *
 * One endpoint, two answers: staff holding `/materials` get the library
 * including drafts, a guardian gets only PUBLISHED modules their child is
 * entitled to. `96_materials.sql` decides which, no verb on the read, and no
 * filtering here that RLS is not already doing.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListMaterialsQuery,
    rateLimit: { key: 'materials.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listMaterials(ctx, query)),
);

/**
 * `material.manage`, the seventeenth verb, added in §3.3.
 *
 * doc 13 §8.3 names "assign material" among the Mentor's key actions and none
 * of the sixteen covered it. Gating on the `/materials` page grant instead
 * would have been the first place in this codebase where a page grant meant
 * permission to write rather than permission to navigate.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: CreateMaterialBody,
    audit: 'material.create',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createMaterial(ctx, body), { status: 201 }),
);
