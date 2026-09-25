import { handler, ok } from '@/lib/http/handler';
import { listPublicMentors } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Published mentor profiles. Reads `mentor_profiles`, never `users`. */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.pages', limit: 120, window: '1 m' } },
  async () => ok(await listPublicMentors()),
);
