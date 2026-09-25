import { handler, ok } from '@/lib/http/handler';
import { ArticleListQuery, CreateArticleBody } from '@/modules/articles/articles.schema';
import { createArticle, listArticles } from '@/modules/articles/articles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The editorial article list (doc 14 §2.3).
 *
 * Separate from `/site/content`. That one spans every type and can only show
 * what all types share. An editor filtering by category, tag or author, or
 * searching 300 articles by title, needs columns a programme does not have.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    query: ArticleListQuery,
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listArticles(ctx, query)),
);

/**
 * `ownerWrite` rather than an action verb: starting a draft is authoring.
 *
 * The gate that matters is not who may create, every author may, but who may
 * publish, and that is the pipeline's `content.publish`, enforced in the
 * service and again by `articles_write`'s WITH CHECK.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: CreateArticleBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createArticle(ctx, body), { status: 201 }),
);
