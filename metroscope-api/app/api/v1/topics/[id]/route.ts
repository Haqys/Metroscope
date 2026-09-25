import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateTopicBody } from '@/modules/progress/progress.schema';
import { deleteTopic, updateTopic } from '@/modules/progress/progress.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handler(
  {
    auth: 'required',
    action: 'material.manage',
    body: UpdateTopicBody,
    audit: 'topic.update',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params, body }) => ok(await updateTopic(ctx, uuidParam(params), body)),
);

/**
 * Refused once anybody has been scored on it (409 TOPIC_IN_USE).
 *
 * The FK cascades, so a delete here would silently take a mentor's recorded
 * percentages for every student with it. Retiring a topic from the syllabus and
 * erasing what children achieved in it are different intentions, and only one
 * of them is a button.
 */
export const DELETE = handler(
  {
    auth: 'required',
    action: 'material.manage',
    audit: 'topic.delete',
    rateLimit: { key: 'materials.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params }) => ok(await deleteTopic(ctx, uuidParam(params))),
);
