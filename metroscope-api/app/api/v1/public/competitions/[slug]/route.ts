import { handler, ok } from '@/lib/http/handler';
import { getPublicCompetition } from '@/modules/competitions/competitions.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One published competition, for `/competitions/[slug]` on the marketing site.
 *
 * A miss is a 404 whether the row is absent, a draft, or archived, the policy
 * returns no rows for all three and this endpoint cannot tell them apart, which
 * is the correct amount to tell an anonymous caller.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.competitions', limit: 60, window: '1 m' } },
  async ({ params }) => ok(await getPublicCompetition(String(params.slug))),
);
