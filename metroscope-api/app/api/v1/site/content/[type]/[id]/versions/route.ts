import { handler, ok, uuidParam } from '@/lib/http/handler';
import { getVersions } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Publish history, newest first. Page-gated; RLS restricts it to staff. */
export const GET = handler(
  {
    auth: 'required',
    page: '/site',
    rateLimit: { key: 'site.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await getVersions(ctx, params.type ?? '', uuidParam(params))),
);
