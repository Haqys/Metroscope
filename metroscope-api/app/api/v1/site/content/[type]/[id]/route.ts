import { z } from 'zod';
import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ApiError } from '@/lib/http/errors';
import { resolveType } from '@/modules/content/content.registry';
import { updateDraft } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Edit a draft's own fields.
 *
 * `ownerWrite` rather than an action verb: writing your own draft is authoring,
 * not administration. What stops an editor changing live copy is the service,
 * only DRAFT is editable, and RLS, not a grant. The reviewer's approval must
 * mean the thing they read.
 *
 * The body schema comes from the registry, one per content type. `handler`'s
 * `body` is fixed at module load while the type is only known from the URL, so
 * the declared schema does nothing but assert a JSON object arrived; the real
 * `.strict()` one runs below. A ZodError thrown here is caught by the same
 * handler path as a declared one, so the 422 is identical either way.
 */
export const PATCH = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: z.record(z.string(), z.unknown()),
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => {
    const typeKey = params.type ?? '';
    const type = resolveType(typeKey);
    if (!type) {
      throw new ApiError(404, 'UNKNOWN_CONTENT_TYPE', `Tipe konten "${typeKey}" tidak dikenal.`);
    }
    const patch = type.draftSchema.parse(body) as Record<string, unknown>;
    return ok(await updateDraft(ctx, typeKey, uuidParam(params), patch));
  },
);
