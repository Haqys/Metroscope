import { handler, ok } from '@/lib/http/handler';
import { ApiError } from '@/lib/http/errors';
import { getPublicMentor } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * One published mentor profile.
 *
 * A miss is a plain 404; the landing page consults `/v1/public/redirects`
 * before rendering not-found, so a renamed profile still resolves.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.pages', limit: 120, window: '1 m' } },
  async ({ params }) => {
    const slug = params.slug ?? '';
    if (!SLUG.test(slug)) throw new ApiError(404, 'NOT_FOUND', 'Mentor tidak ditemukan.');
    return ok(await getPublicMentor(slug));
  },
);
