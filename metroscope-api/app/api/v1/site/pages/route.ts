import { handler, ok } from '@/lib/http/handler';
import { CreatePageBody } from '@/modules/pages/pages.schema';
import { createPage } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a marketing page draft.
 *
 * `ownerWrite`: composing a page is authoring, the same standing an article
 * draft has. Publishing is what needs a verb, and the pipeline owns that.
 *
 * The editorial LIST is `/site/content?type=page`, the cross-type queue,
 * which already answers "what is waiting on me?" without a per-type endpoint.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: CreatePageBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createPage(ctx, body), { status: 201 }),
);
