import { handler, ok, uuidParam } from '@/lib/http/handler';
import { TransitionBody } from '@/modules/content/content.schema';
import { transition } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Make it live now, snapshot it, and purge the website cache.
 *
 * No `audit:` on these routes. The service writes a domain-shaped audit row
 * (entity = 'program', before/after statuses, the note); the handler's generic
 * one would add a second row per action keyed on the route path, so every
 * transition appeared twice in the log saying two different things.
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
    ok(await transition(ctx, params.type ?? '', uuidParam(params), 'publish', body)),
);
