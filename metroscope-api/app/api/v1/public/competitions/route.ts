import { handler, ok } from '@/lib/http/handler';
import { PublicCompetitionsQuery } from '@/modules/competitions/competitions.schema';
import { listPublicCompetitions } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The public competition calendar (doc 13 §5.1, "the single best organic lead
 * magnet Metroscope owns", and §12.8's second consumer of the one source).
 *
 * The SAME rows the portal's Info Lomba and the internal database read. That is
 * the whole point of §3.4: doc 13 §P7 recorded the cost of the alternative,
 * "adding a lomba in the admin changes nothing for students".
 *
 * `asAnon`, so `competitions_select_public` decides what is published rather
 * than a `WHERE` clause in this file. Participants, teams and results are not
 * granted to `anon` at any level, so no mistake here can reach a child's name.
 */
export const GET = handler(
  {
    auth: 'public',
    query: PublicCompetitionsQuery,
    rateLimit: { key: 'public.competitions', limit: 60, window: '1 m' },
  },
  async ({ query }) => ok(await listPublicCompetitions(query)),
);
