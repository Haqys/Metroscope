import { handler, ok } from '@/lib/http/handler';
import { ListInvoicesQuery } from '@/modules/billing/billing.schema';
import { listInvoices } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Invoices, scoped by who is asking.
 *
 * No action verb, page grants gate reads. RLS returns a guardian their own
 * family's bills and Finance everything, from the same query, so the
 * verification queue and the portal's billing page are one endpoint with a
 * status filter rather than two that can disagree.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListInvoicesQuery,
    rateLimit: { key: 'invoices.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listInvoices(ctx, query)),
);
