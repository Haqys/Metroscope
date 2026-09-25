import { handler, ok } from '@/lib/http/handler';
import { ListContentQuery } from '@/modules/content/content.schema';
import { listContent } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every piece of content, across every registered type (doc 14 §2.1).
 *
 * One list endpoint rather than one per type: the CMS home shows "what is
 * pending" across articles, programmes and pages together, and a caller that
 * has to fan out over N endpoints to build that view will forget the N+1th.
 *
 * Gated on the `/site` page grant. No action verb, reads are page-gated, and
 * RLS filters the rows underneath.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    query: ListContentQuery,
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listContent(ctx, query)),
);
