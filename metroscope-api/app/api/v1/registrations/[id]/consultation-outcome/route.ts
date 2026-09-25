import { handler, ok, uuidParam } from '@/lib/http/handler';
import { ConsultationOutcome } from '@/modules/leads/leads.schema';
import { recordConsultationOutcome } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Close a consultation with a structured result.
 *
 * The schema refuses TIDAK_COCOK without a `lossReason`, which is the whole
 * point of the endpoint: doc 13 §22 found "we lost them and nobody knows why" to
 * be the biggest hole in the funnel, and free text does not aggregate. The
 * resulting pipeline status is derived from the outcome rather than accepted
 * from the caller.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'lead.approve',
    body: ConsultationOutcome,
    audit: 'lead.consultation-outcome',
    rateLimit: { key: 'registrations.outcome', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await recordConsultationOutcome(ctx, uuidParam(params), body)),
);
