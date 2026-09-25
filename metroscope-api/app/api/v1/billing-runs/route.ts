import { handler, ok } from '@/lib/http/handler';
import { listBillingRuns } from '@/modules/billing/billing-run.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Monthly billing runs, newest first.
 *
 * No action verb, page grants gate reads, and RLS restricts these rows to
 * holders of `/finance/invoices`. A guardian asking gets an empty list rather
 * than a 403 that would confirm the runs exist.
 */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'billing.runs', limit: 60, window: '1 m' } },
  async ({ ctx }) => ok(await listBillingRuns(ctx)),
);
