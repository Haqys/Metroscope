import { handler, ok, uuidParam } from '@/lib/http/handler';
import { CreateTeamBody } from '@/modules/competitions/competitions.schema';
import { createTeam } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Form a team (doc 13 §12.8, "no team UI despite Team/TeamMember existing";
 * they existed in doc 06 only, and migration 0023 is the first table).
 *
 * Roster work, so `student.edit`. Teams are read from `GET /competitions/:id`
 * along with their members, a separate list endpoint would be a second query
 * of the same rows the detail page already returns.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'student.edit',
    body: CreateTeamBody,
    audit: 'competition.team.create',
    rateLimit: { key: 'competitions.roster', limit: 60, window: '1 m' },
  },
  async ({ ctx, params, body }) =>
    ok(await createTeam(ctx, uuidParam(params), body), { status: 201 }),
);
