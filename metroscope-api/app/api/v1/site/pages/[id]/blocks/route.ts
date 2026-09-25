import { handler, ok, uuidParam } from '@/lib/http/handler';
import { CreateBlockBody } from '@/modules/pages/pages.schema';
import { addBlock } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Add a block to a draft page.
 *
 * `ownerWrite`, like every other authoring write: the block registry decides
 * which types exist and validates the props, the service refuses anything but
 * a DRAFT page, and RLS refuses a caller without `/site`.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: CreateBlockBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await addBlock(ctx, uuidParam(params), body), { status: 201 }),
);
