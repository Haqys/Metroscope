import { handler, ok } from '@/lib/http/handler';
import { ContactSubmissionBody } from '@/modules/surfaces/surfaces.schema';
import { submitContactForm } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A contact message from the public website (doc 13 §9.4, /site/forms).
 *
 * Rate limited to five per hour per IP. The registration form uses three; this
 * is slightly looser because a family may legitimately send a follow-up, and
 * tighter than a general endpoint because there is no reason to send twenty.
 *
 * The response is an acknowledgement and nothing else, no id, no echo. A
 * public endpoint that reflects what it stored is one somebody will use to
 * probe what else it stores.
 */
export const POST = handler(
  {
    auth: 'public',
    body: ContactSubmissionBody,
    rateLimit: { key: 'public.contact', limit: 5, window: '1 h' },
  },
  async ({ ctx, body }) => ok(await submitContactForm(ctx, body), { status: 201 }),
);
