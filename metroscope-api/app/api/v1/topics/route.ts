import { handler, ok } from '@/lib/http/handler';
import { CreateTopicBody } from '@/modules/progress/progress.schema';
import { createTopic } from '@/modules/progress/progress.service';
import { listTopics } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Topics per programme, the library's filter chips, the material form, and
 *  as of §3.6 the axis every progress slider is measured on. */
export const GET = handler(
  { auth: 'required', rateLimit: { key: 'materials.list', limit: 120, window: '1 m' } },
  async ({ ctx }) => ok(await listTopics(ctx)),
);

/**
 * The write half `topics` never had (doc 14 §3.6).
 *
 * The table has existed since Phase 0 with a read policy and no way to create a
 * row; §3.3 recorded the gap and deferred the editor. FR-UPD-2's per-topic
 * sliders make that deferral load-bearing, a board of topic percentages over
 * an empty table is a screen with nothing to render, so it lands here.
 *
 * `material.manage`, the verb doc 13 pairs with the page it puts topic CRUD on
 * (`/materials`). Not an eighteenth verb for four fields on a screen that
 * already has one.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: CreateTopicBody,
    audit: 'topic.create',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createTopic(ctx, body), { status: 201 }),
);
