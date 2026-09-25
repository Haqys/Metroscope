import { handler, ok, uuidParam } from '@/lib/http/handler';
import { proofViewUrl } from '@/modules/billing/billing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A five-minute signed URL for the proof image.
 *
 * The bucket is private: a transfer screenshot carries a bank account, a name
 * and an amount. Short expiry because the URL itself is the credential, anyone
 * holding it can open the file, so it must stop working quickly if it leaks
 * into a log or a chat message.
 */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'invoices.proof-view', limit: 60, window: '1 m' } },
  async ({ ctx, params }) => ok(await proofViewUrl(ctx, uuidParam(params))),
);
