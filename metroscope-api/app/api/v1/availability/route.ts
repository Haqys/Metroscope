import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { SetAvailabilityBody } from '@/modules/scheduling/scheduling.schema';
import { getAvailability, setAvailability } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({ mentorId: z.string().uuid().optional() });

/**
 * A mentor's weekly template, doc 06 §2.3 "MentorAvailability".
 *
 * Feeds the SOFT half of the conflict check. Teaching outside a declared window
 * is a preference somebody may knowingly override; two sessions overlapping is
 * an error the database refuses. Keeping those two apart is why this table
 * exists rather than being folded into the overlap constraint.
 */
export const GET = handler(
  {
    auth: 'required',
    query: Query,
    rateLimit: { key: 'sessions.list', limit: 240, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await getAvailability(ctx, query.mentorId)),
);

/**
 * `ownerWrite`: a mentor maintains their OWN week without holding any verb,
 * they are the only one who knows when they are free. `mentor_availability_write`
 * also admits `session.manage`, so a Secretary can correct it after a phone
 * call; the policy is what decides, not this declaration.
 */
export const PUT = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: SetAvailabilityBody,
    audit: 'session.availability',
    rateLimit: { key: 'sessions.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await setAvailability(ctx, body)),
);
