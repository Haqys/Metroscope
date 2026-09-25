import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { resolveRedirect } from '@/modules/articles/articles.public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where did this URL go? (doc 13 §10.8)
 *
 * Called only on a miss, so the common path never touches it. Resolution is an
 * exact match on `from_path`, no prefix or pattern matching, because a
 * redirect table that can match broadly is a redirect table that can
 * accidentally capture the whole site.
 *
 * Always 200, with `null` when nothing matches: a 404 for "there is no
 * redirect" is indistinguishable from "the endpoint is missing", and the caller
 * is already handling a 404 when it asks.
 */
export const GET = handler(
  {
    auth: 'public',
    query: z.object({ path: z.string().min(1).max(500) }),
    rateLimit: { key: 'public.articles', limit: 120, window: '1 m' },
  },
  async ({ query }) => ok(await resolveRedirect(query.path)),
);
