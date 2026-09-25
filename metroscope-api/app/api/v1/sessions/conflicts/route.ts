import { handler, ok } from '@/lib/http/handler';
import { ConflictQuery } from '@/modules/scheduling/scheduling.schema';
import { checkConflicts } from '@/modules/scheduling/scheduling.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is this slot free?, the pre-flight the booking form runs as you pick a time.
 *
 * A static segment, so Next matches it before `/sessions/[id]`; `uuidParam`
 * would reject the word anyway, which is the second lock on the same door.
 *
 * This endpoint DECIDES nothing. `sessions_mentor_no_overlap` is what actually
 * prevents a double-booking, and it cannot be raced. This exists so a Secretary
 * finds out before they submit rather than after, doc 13 §12.6 calls it a
 * "conflict warning", and a warning is what it is.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ConflictQuery,
    rateLimit: { key: 'sessions.list', limit: 240, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await checkConflicts(ctx, query)),
);
