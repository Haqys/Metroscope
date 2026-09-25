import { handler, ok, uuidParam } from '@/lib/http/handler';
import { TransitionBody } from '@/modules/content/content.schema';
import { transition } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Set a future publish time. The cron does the publishing.
 *
 * The verb is declared here AND re-checked in the service against the
 * transition table, because the service is also reachable from the scheduled
 * publish job and from future tooling. One authoritative table, two callers.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.publish',
    body: TransitionBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await transition(ctx, params.type ?? '', uuidParam(params), 'schedule', body)),
);
