import { handler, ok } from '@/lib/http/handler';
import { listPublicPrograms } from '@/modules/programs/programs.public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Published programmes, the marketing index and the registration picker.
 *
 * Widened in 2.5 from the five columns the picker needed to the marketing copy
 * and cover the public pages need. Deliberately still ONE endpoint: the picker
 * must offer exactly the programmes the site advertises, and a second endpoint
 * is how those two lists drift apart. That drift is not hypothetical. It is
 * what `lib/programs-data.ts` caused, advertising slugs the API never had.
 *
 * Runs as `anon` now rather than as the table owner with a hand-written
 * `WHERE is_published`: the policy is the single statement of what is public,
 * and this is the path where being wrong publishes an unapproved price.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.programs', limit: 60, window: '1 m' } },
  async () => ok(await listPublicPrograms()),
);
