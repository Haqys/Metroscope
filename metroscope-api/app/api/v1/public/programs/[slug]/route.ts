import { handler, ok } from '@/lib/http/handler';
import { ApiError } from '@/lib/http/errors';
import { getPublicProgram } from '@/modules/programs/programs.public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lower-case, hyphenated, the same shape the editor is allowed to save. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * One published programme, with SEO overrides and its success stories.
 *
 * A miss is a plain 404; the landing page asks `/v1/public/redirects` before
 * rendering its own not-found, so a renamed programme still resolves.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.programs', limit: 60, window: '1 m' } },
  async ({ params }) => {
    const slug = params.slug ?? '';
    if (!SLUG.test(slug)) throw new ApiError(404, 'NOT_FOUND', 'Program tidak ditemukan.');
    return ok(await getPublicProgram(slug));
  },
);
