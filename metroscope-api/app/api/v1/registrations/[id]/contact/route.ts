import { handler, ok, uuidParam } from '@/lib/http/handler';
import { AddContact } from '@/modules/leads/leads.schema';
import { addContact } from '@/modules/leads/leads.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Log a contact attempt and optionally set the next-touch date.
 *
 * `lead.approve` rather than a softer grant: the note is attributed to the
 * caller and the follow-up date drives whose queue this lands in, so it is a
 * write on the pipeline, not a comment.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'lead.approve',
    body: AddContact,
    audit: 'lead.contacted',
    rateLimit: { key: 'registrations.contact', limit: 60, window: '1 m' },
  },
  async ({ ctx, body, params }) =>
    ok(await addContact(ctx, uuidParam(params), body), { status: 201 }),
);
