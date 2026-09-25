import { handler, ok, uuidParam } from '@/lib/http/handler';
import { removeTeamMember } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = handler(
  {
    auth: 'required',
    action: 'student.edit',
    audit: 'competition.team.member.remove',
    rateLimit: { key: 'competitions.roster', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) =>
    ok(
      await removeTeamMember(
        ctx,
        uuidParam(params),
        uuidParam(params, 'teamId'),
        uuidParam(params, 'studentId'),
      ),
    ),
);
