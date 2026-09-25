import { handler, ok, uuidParam } from '@/lib/http/handler';
import { getInvoice } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One invoice, with how much of it has actually been settled. */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'invoices.detail', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getInvoice(ctx, uuidParam(params))),
);
