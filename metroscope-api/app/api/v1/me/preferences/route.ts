import { handler, ok } from '@/lib/http/handler';
import { UpdatePreferences } from '@/modules/me/me.schema';
import { updatePreferences } from '@/modules/me/me.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Notification switches. Read them from `GET /v1/me/profile`. */
export const PUT = handler(
  {
    auth: 'required',
    body: UpdatePreferences,
    /** The caller is changing their OWN row; users_update_self is the gate. */
    ownerWrite: true,
    audit: 'profile.preferences',
    rateLimit: { key: 'me.prefs', limit: 30, window: '1 m' },
  },
  async ({ ctx, body }) => ok(await updatePreferences(ctx, body)),
);
