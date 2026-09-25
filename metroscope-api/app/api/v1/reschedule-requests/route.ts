import { handler, ok } from '@/lib/http/handler';
import { CreateRescheduleBody, ListRescheduleQuery } from '@/modules/scheduling/reschedule.schema';
import { createRequest, listRequests } from '@/modules/scheduling/reschedule.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Requests to move a lesson (doc 13 §12.6).
 *
 * No action verb on the read: `reschedule_requests_select` reaches through the
 * session, so a guardian sees their own children's requests and staff holding
 * `/schedule` see all. One endpoint, three answers.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListRescheduleQuery,
    rateLimit: { key: 'reschedule.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listRequests(ctx, query)),
);

/**
 * `ownerWrite`: a guardian asking about their OWN child's lesson.
 *
 * None of the 16 verbs means "ask to move my own child's lesson", and inventing
 * one would put customer self-service into the same vocabulary as
 * `payment.verify`. `reschedule_requests_insert` enforces it, and pins
 * `requested_by_id` to the caller, so a request cannot be filed in somebody
 * else's name.
 *
 * Staff may also file one, for the phone call that is how most of these
 * actually arrive.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: CreateRescheduleBody,
    audit: 'session.reschedule-requested',
    rateLimit: { key: 'reschedule.request', limit: 20, window: '1 h' },
  },
  async ({ ctx, body }) => ok(await createRequest(ctx, body), { status: 201 }),
);
