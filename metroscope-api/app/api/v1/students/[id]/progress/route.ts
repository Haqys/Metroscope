import { handler, ok } from '@/lib/http/handler';
import { UpdateProgressBody } from '@/modules/progress/progress.schema';
import { studentProgress, updateProgress } from '@/modules/progress/progress.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One student's progress, the mentor's form and the family's bars.
 *
 * Beside `GET /v1/students/:id/assessments` and for the same reason: the two
 * readers ask the same questions, which topics, what percent, when, by whom,
 * and `progress_select` is what makes one of them see only their own children.
 *
 * **No `page` declaration**, deliberately. Gating on `/progress` would lock out
 * the guardian this endpoint also serves; the boundary that matters is per-row
 * and RLS draws it. Accepts an id or a slug, like the assessment route.
 */
export const GET = handler(
  {
    auth: 'required',
    rateLimit: { key: 'progress.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await studentProgress(ctx, String(params.id))),
);

/**
 * FR-UPD-2, "inline per-topic slider editing; no wizard required".
 *
 * `progress.edit`, the verb the Phase 0 matrix already gives the Mentor. No new
 * verb, for the second task running.
 *
 * The body carries only `(topicId, percent)` pairs. It cannot carry
 * `updatedById` (the policy pins it to the caller), nor `status`,
 * `daysSinceUpdate` or `isStale`, a client that could send "I am not stale"
 * could lie about the one number this board exists to show.
 */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'progress.edit',
    body: UpdateProgressBody,
    audit: 'progress.update',
    rateLimit: { key: 'progress.write', limit: 120, window: '1 m' },
  },
  async ({ ctx, params, body }) => ok(await updateProgress(ctx, String(params.id), body)),
);
