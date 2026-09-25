import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateAssessmentBody } from '@/modules/assessments/assessments.schema';
import { updateAssessment } from '@/modules/assessments/assessments.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A correction by the author.
 *
 * `assessments_update` narrows to `mentor_id = app.current_user_id()`, so the
 * verb alone is not enough, a Head holds every verb and still cannot rewrite
 * somebody else's evaluation of a child. Disagreeing with an assessment is a
 * conversation with a mentor, not an edit.
 *
 * There is no DELETE. Migration 0025 grants none: an assessment is a report a
 * family has already read, and `points_awarded` on a row that vanished would
 * leave the portal's history with a hole.
 */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'assessment.submit',
    body: UpdateAssessmentBody,
    audit: 'assessment.update',
    rateLimit: { key: 'assessments.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, params, body }) => ok(await updateAssessment(ctx, uuidParam(params), body)),
);
