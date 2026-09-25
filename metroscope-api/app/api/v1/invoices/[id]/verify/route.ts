import { handler, ok, uuidParam } from '@/lib/http/handler';
import { VerifyPayment } from '@/modules/billing/billing.schema';
import { verifyPayment } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approve a transfer (FR-PAY-3).
 *
 * One transaction records the payment, settles the invoice, and activates the
 * student's account on full settlement (FR-ENR-5). Idempotency-Key is required
 * because this is the moment money is recognised: a double-clicked Approve must
 * replay, not record a second payment against the same proof.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'payment.verify',
    body: VerifyPayment,
    idempotent: true,
    audit: 'payment.verified',
    rateLimit: { key: 'invoices.verify', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await verifyPayment(ctx, uuidParam(params), body)),
);
