import { handler, ok } from '@/lib/http/handler';
import { ListInboxQuery } from '@/modules/inbox/inbox.schema';
import { listInbox } from '@/modules/inbox/inbox.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every decision waiting on a human, oldest first (doc 14 §1.3).
 *
 * Gated on the `/inbox` page grant rather than left to RLS alone: this route
 * aggregates sources, and one of them (invoices) is visible to guardians by
 * ownership. See `HandlerConfig.page`.
 *
 * Which ITEMS a holder sees is still RLS's decision, a Secretary gets leads, a
 * Finance user gets money, and neither needs a branch in this service.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/inbox',
    query: ListInboxQuery,
    rateLimit: { key: 'inbox.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listInbox(ctx, query)),
);
