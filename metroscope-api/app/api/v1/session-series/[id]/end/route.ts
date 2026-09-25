import { handler, ok, uuidParam } from '@/lib/http/handler';
import { EndSeriesBody } from '@/modules/scheduling/scheduling.schema';
import { endSeries } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stop a recurring slot from a date onwards.
 *
 * Remaining sessions are CANCELLED with the reason, not deleted, unlike a rule
 * edit, which discards untaught future rows silently. The difference is who
 * needs to know: moving Wednesday by half an hour is housekeeping, while
 * "les Rabu berhenti mulai bulan depan" is something a parent is told, and the
 * cancelled rows carrying a reason are what the portal shows them.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: EndSeriesBody,
    audit: 'session.series.end',
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await endSeries(ctx, uuidParam(params), body)),
);
