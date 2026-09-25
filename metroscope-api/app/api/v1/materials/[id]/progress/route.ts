import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ProgressBody } from '@/modules/materials/materials.schema';
import { setProgress } from '@/modules/materials/materials.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A student opened, or finished, a module.
 *
 * `ownerWrite`: written by the FAMILY and by nobody else, none of the verbs
 * means "record that my child opened a module", and staff must not write it at
 * all. A mentor marking a module finished on a student's behalf would make the
 * engagement number describe the staff rather than the students, which is the
 * one thing this table exists to measure. `material_progress_write` enforces
 * both halves: ownership AND entitlement.
 */
export const PUT = handler(
  {
    auth: 'required',
    ownerWrite: true,
    body: ProgressBody,
    rateLimit: { key: 'materials.progress', limit: 120, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await setProgress(ctx, uuidParam(params), body)),
);
