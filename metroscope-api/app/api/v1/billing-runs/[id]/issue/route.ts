import { handler, ok, uuidParam } from '@/lib/http/handler';
import { issueBillingRun } from '@/modules/billing/billing-run.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue a drafted month, the review-and-click (doc 14 §1.6 exit criterion).
 *
 * `invoice.issue`, and idempotent: this turns a whole month of drafts into real
 * bills and emails every family. A double-clicked button must replay, not issue
 * twice, the run's own ISSUED status is the backstop underneath.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'invoice.issue',
    idempotent: true,
    audit: 'billing.run-issued',
    rateLimit: { key: 'billing.issue', limit: 10, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await issueBillingRun(ctx, uuidParam(params))),
);
