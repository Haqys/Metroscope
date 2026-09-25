import { handler, ok } from '@/lib/http/handler';
import { leadCounts } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-status counts for the `/leads` tabs and the sidebar badge.
 *
 * Separate from the list so a badge does not have to fetch 25 rows to learn one
 * number, and so the two can be cached differently later.
 */
export const GET = handler(
  {
    auth: 'required',
    rateLimit: { key: 'registrations.counts', limit: 120, window: '1 m' },
  },
  async ({ ctx }) => ok(await leadCounts(ctx)),
);
