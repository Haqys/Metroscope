import { handler, ok, uuidParam } from '@/lib/http/handler';
import { RejectPayment } from '@/modules/billing/billing.schema';
import { rejectPayment } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send a proof back with a reason (FR-PAY-3).
 *
 * The reason is mandatory. A rejected proof with no explanation means the parent
 * re-uploads the same wrong screenshot and Finance reviews it twice, doc 13
 * §22's unrecorded-outcome complaint, applied to money.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'payment.verify',
    body: RejectPayment,
    audit: 'payment.rejected',
    rateLimit: { key: 'invoices.reject', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await rejectPayment(ctx, uuidParam(params), body)),
);
