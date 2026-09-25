import { handler, ok } from '@/lib/http/handler';
import { listPublicFaq } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Published FAQ entries, in editor order (doc 13 §9.4).
 *
 * Runs as `anon`, so `faq_entries_select_public` decides what is live. No
 * status filter is written here for the same reason it is written nowhere else
 * in §2.4–§2.7: one statement of what "published" means, in the policy.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.pages', limit: 120, window: '1 m' } },
  async () => ok(await listPublicFaq()),
);
