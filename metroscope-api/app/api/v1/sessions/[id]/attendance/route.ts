import { handler, ok, uuidParam } from '@/lib/http/handler';
import { MarkAttendanceBody } from '@/modules/scheduling/scheduling.schema';
import { markAttendance } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Who turned up, the one write in this module a MENTOR performs.
 *
 * `ownerWrite` rather than an action verb, and this is the case the flag exists
 * for: authority comes from having TAUGHT the session, not from a grant. None
 * of the 16 verbs means "record what I observed in my own lesson", and
 * inventing one would hand the same authority to everyone holding it, including
 * for lessons they were not in the room for.
 *
 * `session_attendance_write` enforces it: the caller must be the session's
 * mentor, or hold `session.manage`. Marking somebody else's lesson returns 403
 * from the policy, not from a branch here.
 */
export const PUT = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: MarkAttendanceBody,
    audit: 'session.attendance',
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await markAttendance(ctx, uuidParam(params), body)),
);
