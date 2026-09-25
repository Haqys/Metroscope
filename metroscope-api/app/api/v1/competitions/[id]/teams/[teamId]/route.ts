import { handler, ok, uuidParam } from '@/lib/http/handler';
import { deleteTeam } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Disband a team.
 *
 * The members go with it, `team_members` cascades from `teams`. The
 * PARTICIPANTS do not: `competition_targets` is a separate row per student and
 * survives, because being in the wrong team is not the same as not competing,
 * and losing a child's readiness history to a team reshuffle would be a
 * surprising amount of damage from one click.
 */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'student.edit',
    audit: 'competition.team.delete',
    rateLimit: { key: 'competitions.roster', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) =>
    ok(await deleteTeam(ctx, uuidParam(params), uuidParam(params, 'teamId'))),
);
