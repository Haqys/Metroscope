import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ConvertLead } from '@/modules/enrollment/enrollment.schema';
import { convertLead } from '@/modules/enrollment/enrollment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Turn a lead into a paying student. ONE transaction (FR-ENR-1).
 *
 * Creates the guardian's account, the student (LIMITED until money clears), the
 * enrolment with its price snapshot, and the registration invoice. Partial
 * failure rolls all of it back.
 *
 * Gated on `lead.approve` rather than `invoice.issue`. The invoice here is a
 * mechanical consequence of a funnel decision, not a discretionary financial
 * act, doc 09 has the Secretary converting, and a Secretary deliberately holds
 * no money verbs. What they cannot do is issue an arbitrary invoice, verify a
 * payment, or set an amount: this endpoint accepts none.
 *
 * `idempotent` honours the Idempotency-Key header, so a double-clicked button
 * or a retried request replays the first response instead of attempting a
 * second conversion. The UNIQUE `converted_student_id` and the row lock in the
 * repo are the backstop underneath it.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'lead.approve',
    body: ConvertLead,
    idempotent: true,
    audit: 'lead.convert',
    rateLimit: { key: 'registrations.convert', limit: 30, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await convertLead(ctx, uuidParam(params), body), { status: 201 }),
);
