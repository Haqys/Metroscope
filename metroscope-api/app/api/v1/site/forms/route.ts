import { z } from 'zod';
import { queryBoolean } from '@/lib/http/query-boolean';
import { handler, ok } from '@/lib/http/handler';
import { listFormSubmissions } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The contact inbox (doc 13 §9.4, /site/forms).
 *
 * Gated on the `/leads` page grant by RLS, not by a content verb: a contact
 * message and a registration are the same kind of work, and splitting them
 * across two grants means a Secretary sees one queue and not the other for no
 * reason anyone could explain.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/leads',
    query: z.object({ handled: queryBoolean.default(false) }),
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listFormSubmissions(ctx, query.handled)),
);
