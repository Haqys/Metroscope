import { handler, ok, uuidParam } from '@/lib/http/handler';
import { getSurfaceForEditor } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The editor's read for one FAQ entry, testimonial or mentor profile.
 *
 * One route for three types because the shape of the question is identical,
 * "give me this row, camelCase, for the form". The service holds a column list
 * per type; there is no `SELECT *` behind this, and an unknown type is a 404
 * rather than a lookup into an arbitrary table.
 *
 * Editing goes through `PATCH /site/content/:type/:id`, the shared pipeline.
 */
export const GET = handler(
  { auth: 'required', page: '/site', rateLimit: { key: 'site.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) =>
    ok(await getSurfaceForEditor(ctx, params.type ?? '', uuidParam(params))),
);
