import { handler, ok } from '@/lib/http/handler';
import { getCompetition } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One competition and everything hanging off it (doc 13 §12.8,
 * "`/competitions/[id]` with participants, teams, readiness distribution,
 * deadline checklist").
 *
 * `id` accepts a slug too, because the internal detail route is
 * `/competitions/[slug]` and the public one shares the identifier. There is no
 * matching PATCH here: the catalogue is edited through the CMS pipeline at
 * `/site/content/competition/:id`, and a second write path would be the second
 * source of truth in miniature.
 */
export const GET = handler(
  {
    auth: 'required',
    rateLimit: { key: 'competitions.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await getCompetition(ctx, String(params.id))),
);
