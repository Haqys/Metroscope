import { handler, ok, uuidParam } from '@/lib/http/handler';
import { UpdateLeadStatus } from '@/modules/leads/leads.schema';
import { updateStatus } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Move a lead through the pipeline: approve into CONSULTING, park in NURTURING,
 * or close as REJECTED / LOST with a reason.
 *
 * Named `/status` rather than doc 14's `/outcome`. That document also lists
 * `/consultation-outcome`, and two endpoints called "outcome" that mean
 * different things is how call sites end up wired to the wrong one.
 *
 * CONVERTED is not reachable here. It is what the conversion transaction leaves
 * behind (doc 14 §1.4), and setting it directly would report revenue with no
 * student, enrolment or invoice behind it.
 */
export const PATCH = handler(
  {
    auth: 'required',
    action: 'lead.approve',
    body: UpdateLeadStatus,
    audit: 'lead.status-change',
    rateLimit: { key: 'registrations.status', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) => ok(await updateStatus(ctx, uuidParam(params), body)),
);
