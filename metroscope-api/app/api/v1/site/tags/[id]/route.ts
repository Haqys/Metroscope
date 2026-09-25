import { handler, ok, uuidParam } from '@/lib/http/handler';
import { deleteTag } from '@/modules/articles/articles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = handler(
  {
    auth: 'required',
    action: 'content.review',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deleteTag(ctx, uuidParam(params))),
);
