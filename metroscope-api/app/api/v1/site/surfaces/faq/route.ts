import { handler, ok } from '@/lib/http/handler';
import { CreateFaqBody } from '@/modules/surfaces/surfaces.schema';
import { createFaq } from '@/modules/surfaces/surfaces.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Create an FAQ draft. `ownerWrite`, writing a Q&A is authoring. */
export const POST = handler(
  {
    auth: 'required',
    ownerWrite: true,
    page: '/site',
    body: CreateFaqBody,
    rateLimit: { key: 'site.write', limit: 60, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await createFaq(ctx, body), { status: 201 }),
);
