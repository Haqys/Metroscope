import { handler, ok } from '@/lib/http/handler';
import { ProgressBoardQuery } from '@/modules/progress/progress.schema';
import { progressBoard } from '@/modules/progress/progress.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The staleness board (doc 03 FR-UPD-1, doc 13 §7.2).
 *
 * "Students sorted by days since last progress update, so the work surfaces
 * itself." The threshold, fourteen days, doc 13's *"belum diupdate 14 hari"*,
 * and the NEVER/STALE/CURRENT state both come from `app.progress_status()`, so
 * this endpoint cannot state a rule the detail page or the tests disagree with.
 *
 * Gated by the `/progress` page grant, which doc 13 §8.3 gives to HEAD and
 * MENTOR. SECRETARY holds `/students` and `student.edit` and sees nothing here,
 * exactly as on `/assessments`: a percentage per topic is a teaching judgement,
 * not roster administration.
 */
export const GET = handler(
  {
    auth: 'required',
    page: '/progress',
    query: ProgressBoardQuery,
    rateLimit: { key: 'progress.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await progressBoard(ctx, query)),
);
