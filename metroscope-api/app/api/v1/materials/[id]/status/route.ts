import { handler, ok, uuidParam } from '@/lib/http/handler';
import { MaterialStatusBody } from '@/modules/materials/materials.schema';
import { setMaterialStatus } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Publish, unpublish, archive, doc 13 §12.7's "publish state so half-finished
 * modules are not visible".
 *
 * Separate from the draft edit for the same reason the CMS pipeline separates
 * them: changing what a module says and changing who can see it are different
 * decisions, and one form doing both makes the second one an accident.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: MaterialStatusBody,
    audit: 'material.status',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await setMaterialStatus(ctx, uuidParam(params), body)),
);
