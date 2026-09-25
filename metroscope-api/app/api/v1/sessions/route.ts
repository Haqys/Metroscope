import { handler, ok } from '@/lib/http/handler';
import { ListSessionsQuery, CreateSessionBody } from '@/modules/scheduling/scheduling.schema';
import { createSession, listSessions } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The calendar, for every surface that renders one (doc 14 §3.1).
 *
 * One endpoint serves the internal team calendar, the mentor's own week and a
 * parent's timetable, because they are the same question asked by three people,
 * and `95_scheduling.sql` gives each of them a different answer. A per-app
 * endpoint would be three copies of one query, and the copy that drifts is the
 * one that shows a family somebody else's child.
 *
 * No action verb on the read: page grants gate reads (doc 14 §1.1). A caller
 * without `/schedule` still sees their own sessions, which is the point.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListSessionsQuery,
    rateLimit: { key: 'sessions.list', limit: 240, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listSessions(ctx, query)),
);

/**
 * `session.manage`. HEAD and SECRETARY. Scheduling is Secretary work
 * (doc 13 §8.3), which is also why §T.1 deleted this form from the mentor app.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: CreateSessionBody,
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createSession(ctx, body), { status: 201 }),
);
