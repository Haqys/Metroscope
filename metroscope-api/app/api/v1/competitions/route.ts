import { handler, ok } from '@/lib/http/handler';
import {
  CreateCompetitionBody,
  ListCompetitionsQuery,
} from '@/modules/competitions/competitions.schema';
import { createCompetition, listCompetitions } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The catalogue (doc 13 §12.8, "**one** source feeding portal Info Lomba and
 * the public marketing calendar").
 *
 * One endpoint for staff and families both. `97_competitions.sql` gives staff
 * the drafts and everyone else the published rows; `studentId` narrows to one
 * child's entries, which is the portal's "Lomba Saya" and is not a security
 * boundary. RLS already decided which targets exist for this caller.
 */
export const GET = handler(
  {
    auth: 'required',
    query: ListCompetitionsQuery,
    rateLimit: { key: 'competitions.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) => ok(await listCompetitions(ctx, query)),
);

/**
 * Creation is a `/site` job, like every other content type.
 *
 * A competition carries the marketing copy that appears on the public calendar,
 * so it is governed as content: `/site` to author, `content.publish` to release.
 * Running a lomba, entering students, forming teams, recording results, needs
 * none of that and is gated separately. A Ketua who wants the Secretary to own
 * the catalogue too grants them `/site`, or builds the "Admin Lomba" role doc 13
 * §8.5 proposes; roles are data.
 *
 * `ownerWrite` for the same reason `/site/articles` uses it: starting a draft is
 * authoring, and the gate that matters is who may PUBLISH, `content.publish`,
 * enforced by the pipeline and again by `competitions_write`'s WITH CHECK.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: CreateCompetitionBody,
    audit: 'competition.create',
    rateLimit: { key: 'competitions.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createCompetition(ctx, body), { status: 201 }),
);
