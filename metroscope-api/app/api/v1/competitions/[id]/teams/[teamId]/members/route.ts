import { handler, ok, uuidParam } from '@/lib/http/handler';
import { AddTeamMemberBody } from '@/modules/competitions/competitions.schema';
import { addTeamMember } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Add a member.
 *
 * Refused with 422 NOT_A_PARTICIPANT if the student has no target row for this
 * competition, a composite foreign key, not a check in this file. A child
 * listed in a team but never entered has no readiness, no result and no
 * certificate, and nobody finds out until the day the certificates are written.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'student.edit',
    body: AddTeamMemberBody,
    audit: 'competition.team.member.add',
    rateLimit: { key: 'competitions.roster', limit: 60, window: '1 m' },
  },
  async ({ ctx, params, body }) =>
    ok(await addTeamMember(ctx, uuidParam(params), uuidParam(params, 'teamId'), body), {
      status: 201,
    }),
);
