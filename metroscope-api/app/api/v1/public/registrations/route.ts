import { handler, ok } from '@/lib/http/handler';
import { CreateLead } from '@/modules/leads/leads.schema';
import { submitLead } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public registration endpoint, the top of the funnel.
 *
 * Unauthenticated by necessity, so it is the most exposed route in the
 * service: tight rate limit, honeypot, strict schema. Everything else is
 * enforced in the service layer, never trusted from the caller.
 */
export const POST = handler(
  {
    auth: 'public',
    body: CreateLead,
    rateLimit: { key: 'registration.submit', limit: 3, window: '1 h' },
  },
  async ({ ctx, body }) => ok(await submitLead(ctx, body), { status: 201 }),
);
