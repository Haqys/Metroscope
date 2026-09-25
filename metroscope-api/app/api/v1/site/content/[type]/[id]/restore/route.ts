import { handler, ok, uuidParam } from '@/lib/http/handler';
import { RestoreBody } from '@/modules/content/content.schema';
import { restoreVersion } from '@/modules/content/content.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Put an old version back, as a DRAFT, never straight to live.
 *
 * Restoring is one editorial decision and publishing is another; collapsing
 * them would make a misclick change the public site.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'content.publish',
    body: RestoreBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await restoreVersion(ctx, params.type ?? '', uuidParam(params), body)),
);
