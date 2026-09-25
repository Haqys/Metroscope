import { handler, ok } from '@/lib/http/handler';
import { TagBody } from '@/modules/articles/articles.schema';
import { listTags, upsertTag } from '@/modules/articles/articles.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx }) => ok(await listTags(ctx)),
);

/**
 * Create-or-return, so the editor types a tag name and gets a tag, new or
 * existing. `ownerWrite`: tagging is part of writing, unlike a category.
 *
 * 200 rather than 201 even when it creates: the caller's question is "give me
 * the id for this name", and the answer is the same either way. The `created`
 * flag in the body is there for the UI to say "tag baru dibuat".
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: TagBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await upsertTag(ctx, body)),
);
