import { handler, ok, uuidParam } from '@/lib/http/handler';
import { SeoBody } from '@/modules/content/content.schema';
import { getSeo, saveSeo } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  { auth: 'required', page: '/site', rateLimit: { key: 'site.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getSeo(ctx, params.type ?? '', uuidParam(params))),
);

/**
 * Overrides only. Every field is optional and the renderer derives sensible
 * values from the content itself, so an editor who never opens this panel
 * still ships correct metadata (doc 13 §10.7).
 */
export const PUT = handler(
  {
    auth: 'required',
    action: 'content.publish',
    body: SeoBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await saveSeo(ctx, params.type ?? '', uuidParam(params), body)),
);
