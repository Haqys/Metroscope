import { handler, ok } from '@/lib/http/handler';
import { CreateProgramBody } from '@/modules/programs/programs.schema';
import { createProgram } from '@/modules/programs/programs.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a programme draft.
 *
 * `settings.edit` rather than `ownerWrite`: a programme carries a price, and
 * inventing a commercial offer is an administrative act, not authoring. That is
 * the difference from articles, where any author may start a draft, and it is
 * why `programs_write`'s WITH CHECK has always named `settings.edit` alongside
 * the content verbs.
 *
 * The editorial LIST is `/site/content?type=program`, the cross-type queue that
 * already answers "what is waiting on me?" without a per-type endpoint.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'settings.edit',
    body: CreateProgramBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createProgram(ctx, body), { status: 201 }),
);
