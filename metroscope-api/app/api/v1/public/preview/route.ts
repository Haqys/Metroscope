import { z } from 'zod';
import { handler, ok } from '@/lib/http/handler';
import { redeemPreview } from '@/modules/pages/pages.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Redeem a preview token for one unpublished page (doc 13 §9.5).
 *
 * `auth: 'public'` because the TOKEN is the credential, the reviewer opening
 * the link on a phone has no session on this origin. It is not an open door:
 * the token is matched by hash against a stored grant, that grant names one
 * entity id, and it expires an hour after it was minted. An invalid or expired
 * token is a 404, identical to a page that does not exist, so the endpoint
 * cannot be used to test whether a draft is there.
 *
 * Rate limited hard. This is the one route where guessing has a prize.
 */
export const GET = handler(
  {
    auth: 'public',
    query: z.object({ token: z.string().min(20).max(200) }),
    rateLimit: { key: 'public.preview', limit: 20, window: '1 m' },
  },
  async ({ query }) => ok(await redeemPreview(query.token)),
);
