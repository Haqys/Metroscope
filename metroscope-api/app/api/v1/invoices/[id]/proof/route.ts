import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ConfirmProof } from '@/modules/billing/billing.schema';
import { confirmProof } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Step 2: the upload landed, put this in front of Finance.
 *
 * Moves the invoice to AWAITING_VERIFICATION, which is the ONLY status change a
 * guardian may make, enforced by `app.guard_invoice_columns()` rather than by
 * this endpoint being polite about it.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: ConfirmProof,
    audit: 'payment.proof-submitted',
    rateLimit: { key: 'invoices.proof', limit: 20, window: '1 h' },
  },
  async ({ ctx, body, params }) => ok(await confirmProof(ctx, uuidParam(params), body)),
);
