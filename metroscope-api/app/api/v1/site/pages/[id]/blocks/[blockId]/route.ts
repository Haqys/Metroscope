import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateBlockBody } from '@/modules/pages/pages.schema';
import { deleteBlock, updateBlock } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Both routes take the page id AND the block id, and every query filters on
 * both. A block id alone would be enough to find the row, and that is exactly
 * why it is not enough to write it: scoping to the page makes a cross-page
 * write impossible rather than merely unlikely.
 */
export const PATCH = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: UpdateBlockBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await updateBlock(ctx, uuidParam(params), uuidParam(params, 'blockId'), body)),
);

export const DELETE = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) =>
    ok(await deleteBlock(ctx, uuidParam(params), uuidParam(params, 'blockId'))),
);
