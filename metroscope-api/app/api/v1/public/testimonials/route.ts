import { handler, ok } from '@/lib/http/handler';
import { listPublicTestimonials } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Published testimonials (doc 13 §9.4).
 *
 * The consent record is deliberately not part of this payload, see the
 * service. Consent must EXIST before publication; it must not be broadcast.
 */
export const GET = handler(
  { auth: 'public', rateLimit: { key: 'public.pages', limit: 120, window: '1 m' } },
  async () => ok(await listPublicTestimonials()),
);
