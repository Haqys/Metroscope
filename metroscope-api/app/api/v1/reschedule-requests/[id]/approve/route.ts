import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ApproveRescheduleBody } from '@/modules/scheduling/reschedule.schema';
import { approveRequest } from '@/modules/scheduling/reschedule.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approving moves the lesson, so it needs the grant that moves lessons.
 *
 * One transaction retires the original as RESCHEDULED and creates the
 * replacement, a replacement with no cancellation is a double-booked mentor,
 * and a cancellation with no replacement is a child with no lesson.
 *
 * `reschedule.decide`, not the guardian's `reschedule.request` budget. Filing a
 * request is a rare act by a family and 20/hour is a spam control; working the
 * queue is a Secretary's routine morning, and sharing one bucket meant clearing
 * a backlog locked them out of their own inbox.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'session.manage',
    body: ApproveRescheduleBody,
    audit: 'session.reschedule-approved',
    rateLimit: { key: 'reschedule.decide', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await approveRequest(ctx, uuidParam(params), body)),
);
