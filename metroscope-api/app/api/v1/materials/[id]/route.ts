import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { UpdateMaterialBody } from '@/modules/materials/materials.schema';
import { getMaterial, updateMaterial } from '@/modules/materials/materials.service';
import { ApiError } from '@/lib/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({ studentId: z.string().uuid().optional() });

/**
 * By id OR by slug, the portal detail route is `/portal/materials/[slug]`, and
 * resolving a slug to an id on the client would be a round trip whose only
 * purpose is to satisfy a URL shape.
 */
export const GET = handler(
  {
    auth: 'required',
    query: Query,
    rateLimit: { key: 'materials.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query, params }) => {
    const key = params.id;
    if (!key || key.length > 120) throw new ApiError(400, 'INVALID_ID', 'Alamat tidak valid.');
    return ok(await getMaterial(ctx, key, query.studentId));
  },
);

export const PATCH = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: UpdateMaterialBody,
    audit: 'material.update',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => {
    const key = params.id;
    if (!key) throw new ApiError(400, 'INVALID_ID', 'Alamat tidak valid.');
    return ok(await updateMaterial(ctx, key, body));
  },
);
