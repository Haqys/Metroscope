import { handler, ok } from '@/lib/http/handler';
import { ListLeadsQuery } from '@/modules/leads/leads.schema';
import { listLeads } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The lead pipeline. Renders `/leads` in the internal app.
 *
 * No `action` declared, deliberately. The 16 verbs are write verbs. There is no
 * `lead.read` and there should not be, because **page grants gate reads**
 * (doc 12 §10.2). Visibility is decided by the `registrations_select` RLS policy,
 * which requires `has_page('/leads')`: a caller without it gets 200 and an empty
 * list rather than a 403 that would confirm leads exist.
 *
 * HTTP only, parse, delegate, serialize. A lint rule forbids importing db/ from
 * app/api, and guard-routes.mjs fails CI if a WRITE route omits its action.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListLeadsQuery,
    rateLimit: { key: 'registrations.list', limit: 100, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listLeads(ctx, query)),
);
