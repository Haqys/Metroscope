import { handler, ok } from '@/lib/http/handler';
import { inboxCounts } from '@/modules/inbox/inbox.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Uncapped totals per type, the sidebar badge and the filter tabs.
 *
 * A higher rate limit than the list because this is polled: it is rendered on
 * every internal page, not just `/inbox`.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/inbox',
    rateLimit: { key: 'inbox.counts', limit: 240, window: '1 m' },
  },
  async ({ ctx }) => ok(await inboxCounts(ctx)),
);
