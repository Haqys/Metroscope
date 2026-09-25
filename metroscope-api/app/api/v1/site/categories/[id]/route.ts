import { handler, ok, uuidParam } from '@/lib/http/handler';
import { CategoryBody } from '@/modules/articles/articles.schema';
import { deleteCategory, saveCategory } from '@/modules/articles/articles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handler(
  {
    auth: 'required',
    action: 'content.review',
    body: CategoryBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await saveCategory(ctx, body, uuidParam(params))),
);

export const DELETE = handler(
  {
    auth: 'required',
    action: 'content.review',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deleteCategory(ctx, uuidParam(params))),
);
