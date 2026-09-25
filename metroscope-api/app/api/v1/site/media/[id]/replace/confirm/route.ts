import { z } from 'zod';
import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ALLOWED_MIME, MAX_BYTES } from '@/modules/media/media.schema';
import { confirmReplace } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    storageKey: z.string().min(1).max(300),
    mimeType: z.enum(ALLOWED_MIME),
    sizeBytes: z.number().int().min(1).max(MAX_BYTES),
    width: z.number().int().min(1).max(30000).optional(),
    height: z.number().int().min(1).max(30000).optional(),
  })
  .strict();

/** Point the asset at the newly uploaded object and bin the old one. */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.publish',
    body: Body,
    rateLimit: { key: 'media.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await confirmReplace(ctx, uuidParam(params), body)),
);
