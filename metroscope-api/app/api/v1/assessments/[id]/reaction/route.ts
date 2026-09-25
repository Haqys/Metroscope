import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ReactionBody } from '@/modules/assessments/assessments.schema';
import { reactToAssessment } from '@/modules/assessments/assessments.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * FR-ASV-4, the family's appreciation, and the documented route
 * (`POST /assessments/:id/reaction`, doc 03 §API).
 *
 * `ownerWrite` and no verb: none of the seventeen means "thank my child's
 * mentor", and pressing it is not an administrative act. RLS is the whole gate,
 * `assessment_reactions_write` admits only a guardian of the student the
 * assessment is about, which also means staff cannot react to their own work.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: ReactionBody,
    audit: 'assessment.react',
    rateLimit: { key: 'assessments.react', limit: 30, window: '1 m' },
  },
  async ({ ctx, params, body }) => ok(await reactToAssessment(ctx, uuidParam(params), body)),
);
