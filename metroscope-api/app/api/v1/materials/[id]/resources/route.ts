import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ResourceBody } from '@/modules/materials/materials.schema';
import { addResource } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A YouTube video, a PDF, or a Drive link, doc 06 allows nothing else. */
export const POST = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: ResourceBody,
    audit: 'material.resource-add',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await addResource(ctx, uuidParam(params), body)),
);
