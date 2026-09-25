import { handler, ok, uuidParam } from '@/lib/http/handler';
import { AddTargetBody } from '@/modules/competitions/competitions.schema';
import { addTarget } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enter a student in a lomba.
 *
 * `student.edit`, roster work, which doc 13 §8.3 gives the Secretary. The
 * matching result write below needs `progress.edit` instead, so the person who
 * enters a child cannot also decide how they did. Both verbs already existed;
 * neither role gained anything it did not already have for its own records.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'student.edit',
    body: AddTargetBody,
    audit: 'competition.target.add',
    rateLimit: { key: 'competitions.roster', limit: 60, window: '1 m' },
  },
  async ({ ctx, params, body }) =>
    ok(await addTarget(ctx, uuidParam(params), body), { status: 201 }),
);
