import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateSessionBody } from '@/modules/scheduling/scheduling.schema';
import { getSession, updateSession } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  { auth: 'required', rateLimit: { key: 'sessions.list', limit: 240, window: '1 m' } },
  async ({ ctx, params }) => ok(await getSession(ctx, uuidParam(params))),
);

/**
 * Edit ONE session, doc 06 §7.3's "edit this session", as opposed to
 * `PATCH /session-series/:id`, which edits the rule behind all of them.
 */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: UpdateSessionBody,
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateSession(ctx, uuidParam(params), body)),
);
