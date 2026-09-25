import { handler, ok } from '@/lib/http/handler';
import { CreateMentorBody } from '@/modules/surfaces/surfaces.schema';
import { createMentor } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a mentor profile for an existing STAFF account.
 *
 * `settings.edit` rather than `ownerWrite`: publishing somebody as a member of
 * the team is an administrative statement about who works here, not authoring.
 * The service also refuses a non-staff account outright, a profile for a
 * guardian would publish a customer's name as a mentor.
 */
export const POST = handler(
  {
    auth: 'required',
    action: 'settings.edit',
    page: '/site',
    body: CreateMentorBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createMentor(ctx, body), { status: 201 }),
);
