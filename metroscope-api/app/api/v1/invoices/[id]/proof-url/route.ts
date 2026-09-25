import { handler, ok, uuidParam } from '@/lib/http/handler';
import { RequestProofUpload } from '@/modules/billing/billing.schema';
import { requestProofUpload } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Step 1 of paying: somewhere to put the screenshot (FR-PAY-2).
 *
 * No action verb. This is a guardian acting on their own invoice, and none of
 * the 16 verbs describes that. RLS decides whose invoice it is; the returned key
 * is server-chosen and namespaced to this invoice, so the URL cannot be aimed
 * anywhere else.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: RequestProofUpload,
    rateLimit: { key: 'invoices.proof-url', limit: 20, window: '1 h' },
  },
  async ({ ctx, body, params }) => ok(await requestProofUpload(ctx, uuidParam(params), body)),
);
