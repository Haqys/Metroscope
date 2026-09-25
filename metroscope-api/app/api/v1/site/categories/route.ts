import { handler, ok } from '@/lib/http/handler';
import { CategoryBody } from '@/modules/articles/articles.schema';
import { listCategories, saveCategory } from '@/modules/articles/articles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx }) => ok(await listCategories(ctx)),
);

/**
 * `content.review`, not `/site` alone.
 *
 * A category is navigation: adding one changes the site's menu and its URL
 * space. Tags are the free-form half of the taxonomy and any author may make
 * those (see /site/tags), the split is deliberate (doc 13 §10.3).
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.review',
    body: CategoryBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await saveCategory(ctx, body), { status: 201 }),
);
