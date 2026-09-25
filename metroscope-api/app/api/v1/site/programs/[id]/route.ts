import { handler, ok, uuidParam } from '@/lib/http/handler';
import { deleteProgram, getProgramForEditor } from '@/modules/programs/programs.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One programme, every editable field, the editor's read, and its preview.
 *
 * Editing goes through `PATCH /site/content/program/:id`, the shared pipeline.
 * Page-gated rather than verb-gated, like every other read: RLS filters the row
 * underneath, and a caller without `/site` gets nothing rather than a 403 that
 * would confirm the programme exists.
 */
export const GET = handler(
  { auth: 'required', page: '/site', rateLimit: { key: 'site.list', limit: 120, window: '1 m' } },
  async ({ ctx, params }) => ok(await getProgramForEditor(ctx, uuidParam(params))),
);

export const DELETE = handler(
  {
    auth: 'required',
    action: 'settings.edit',
    page: '/site',
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deleteProgram(ctx, uuidParam(params))),
);
