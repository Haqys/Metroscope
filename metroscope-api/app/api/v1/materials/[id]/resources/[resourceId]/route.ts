import { handler, ok, uuidParam } from '@/lib/http/handler';
import { removeResource } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = handler(
  {
    auth: 'required',
    action: 'material.manage',
    audit: 'material.resource-remove',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) =>
    ok(await removeResource(ctx, uuidParam(params), uuidParam(params, 'resourceId'))),
);
