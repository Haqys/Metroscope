import { handler, ok, uuidParam } from '@/lib/http/handler';
import { CancelSessionBody } from '@/modules/scheduling/scheduling.schema';
import { cancelSession } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancel, with a reason, never delete.
 *
 * There is no DELETE policy on `sessions` at all (`95_scheduling.sql`): a
 * lesson that was called off is a fact a parent asks about and a mentor's fee
 * report has to exclude, and a missing row answers neither question.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: CancelSessionBody,
    audit: 'session.cancel',
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await cancelSession(ctx, uuidParam(params), body)),
);
