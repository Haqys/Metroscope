import { handler, ok } from '@/lib/http/handler';
import { ConfirmPhoto } from '@/modules/me/me.schema';
import { confirmPhoto } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Step two: the upload landed, point the profile at it. */
export const POST = handler(
  {
    auth: 'required',
    body: ConfirmPhoto,
    /** The caller is changing their OWN row; users_update_self is the gate. */
    ownerWrite: true,
    audit: 'profile.photo',
    rateLimit: { key: 'me.photo.confirm', limit: 20, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await confirmPhoto(ctx, body.storageKey)),
);
