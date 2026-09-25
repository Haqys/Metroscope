import { handler, ok } from '@/lib/http/handler';
import { UpdateStudentSettings } from '@/modules/me/me.schema';
import { updateStudentSettings } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The settings a guardian owns on their own child (FR-SET-1..3).
 *
 * Not `PATCH /v1/students/:id`, which is the staff route behind `student.edit`
 * and reaches every column. This one lives under `/me` because that is what it
 * is: three fields, on a student the caller is guardian for, enforced by
 * `app.update_student_self()` rather than by this handler believing the path.
 */
export const PATCH = handler(
  {
    auth: 'required',
    body: UpdateStudentSettings,
    /** Ownership is the authorisation; app.owns_student() is the gate. */
    ownerWrite: true,
    audit: 'student.settings.update',
    rateLimit: { key: 'me.student.write', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateStudentSettings(ctx, String(params.id), body)),
);
