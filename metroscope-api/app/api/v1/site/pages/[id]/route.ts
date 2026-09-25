import { handler, ok, uuidParam } from '@/lib/http/handler';
import { deletePage, getPageForEditor } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One page with every block, in order, the editor's read.
 *
 * Includes hidden and out-of-window blocks, which the public read filters out:
 * an editor must be able to see a seasonal banner that has not opened yet, or
 * they cannot tell a scheduled block from a missing one.
 */
export const GET = handler(
  { auth: 'required', page: '/site', rateLimit: { key: 'site.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getPageForEditor(ctx, uuidParam(params))),
);

export const DELETE = handler(
  {
    auth: 'required',
    action: 'content.publish',
    page: '/site',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deletePage(ctx, uuidParam(params))),
);
