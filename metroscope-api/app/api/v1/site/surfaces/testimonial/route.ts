import { handler, ok } from '@/lib/http/handler';
import { CreateTestimonialBody } from '@/modules/surfaces/surfaces.schema';
import { createTestimonial } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a testimonial draft.
 *
 * `ownerWrite` to create; the consent record is what gates PUBLISH, enforced by
 * the registry's `beforeTransition` so the scheduled-publish cron is covered too.
 */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: CreateTestimonialBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createTestimonial(ctx, body), { status: 201 }),
);
