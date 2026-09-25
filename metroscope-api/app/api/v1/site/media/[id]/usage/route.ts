import { handler, ok, uuidParam } from '@/lib/http/handler';
import { getUsage } from '@/modules/media/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where this asset is used, the evidence behind the delete guard. */
export const GET = handler(
  { auth: 'required', page: '/site', rateLimit: { key: 'media.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getUsage(ctx, uuidParam(params))),
);
