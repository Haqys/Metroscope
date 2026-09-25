import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateTargetBody } from '@/modules/competitions/competitions.schema';
import { removeTarget, updateTarget } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Readiness and result, `progress.edit`.
 *
 * doc 13 §8.3 lists "record competition result" among the Mentor's five key
 * actions, and this is the endpoint that finally lets them: §3.4's migration
 * also grants MENTOR the `/competitions` page, which the same section's matrix
 * always specified as a read and the seed had never given.
 *
 * `readiness_pct` is the number `/schedule`'s sidebar has printed from a fixture
 * since the beginning, its own comment said "nothing computes it". This does.
 */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'progress.edit',
    body: UpdateTargetBody,
    audit: 'competition.target.update',
    rateLimit: { key: 'competitions.result', limit: 120, window: '1 m' },
  },
  async ({ ctx, params, body }) =>
    ok(await updateTarget(ctx, uuidParam(params), uuidParam(params, 'targetId'), body)),
);

/** Withdrawing a student is roster work again, not a result. */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'student.edit',
    audit: 'competition.target.remove',
    rateLimit: { key: 'competitions.roster', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) =>
    ok(await removeTarget(ctx, uuidParam(params), uuidParam(params, 'targetId'))),
);
