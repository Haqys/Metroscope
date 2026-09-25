import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { getAchievements } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Points, rank, leaderboard and badges.
 *
 * `student` is optional: a guardian with one child needs no argument, one with
 * several picks, and a staff account passes the student they are looking at.
 * Which rows come back is still `students_select`, not this parameter.
 */
export const GET = handler(
  {
    auth: 'required',
    query: z.object({ student: z.string().min(1).max(200).optional() }),
    rateLimit: { key: 'me.achievements', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await getAchievements(ctx, query.student)),
);
