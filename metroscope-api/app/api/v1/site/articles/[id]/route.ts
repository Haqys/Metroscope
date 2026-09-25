import { handler, ok, uuidParam } from '@/lib/http/handler';
import { deleteArticle, getArticle } from '@/modules/articles/articles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One article, body AST included.
 *
 * This is also the internal preview source. There is deliberately no preview
 * token: the editor reads the draft through the same policy that lets them edit
 * it, so preview cannot become a second, weaker path to unpublished content.
 *
 * Editing goes through `PATCH /site/content/article/:id`, the shared pipeline.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await getArticle(ctx, uuidParam(params))),
);

/**
 * Only an unpublished draft. Anything that has been live is archived instead,
 * see the service; the URL is out in the world and deleting the row throws away
 * the version history that explains what used to be there.
 */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'content.publish',
    page: '/site',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deleteArticle(ctx, uuidParam(params))),
);
