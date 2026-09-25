import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ReorderBlocksBody } from '@/modules/pages/pages.schema';
import { reorderBlocks } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Set the block order, the whole list, not a move instruction.
 *
 * The body must name exactly this page's blocks; the service compares the set
 * and refuses anything else. A partial list would renumber some blocks and
 * leave the rest at their old indices, silently interleaving them.
 */
export const PUT = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: ReorderBlocksBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await reorderBlocks(ctx, uuidParam(params), body)),
);
