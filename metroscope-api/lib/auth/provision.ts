import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { ApiError } from '@/lib/http/errors';

/**
 * Find or create a Supabase Auth account, idempotently by email.
 *
 * Extracted from the conversion flow, which needed exactly this and now shares
 * it with staff invites. Both create an account somebody else will claim, and
 * both must survive a retry without producing a second one.
 *
 * The account is created with **no password**. Inventing one would mean either
 * emailing a plaintext password or creating an account nobody can get into; the
 * person sets theirs from the link in their invite, minted at send time.
 *
 * One seam is worth naming rather than hiding: `users.id` mirrors
 * `auth.users.id`, which the admin API assigns, so the auth account must exist
 * before the database transaction. If that transaction rolls back the auth user
 * survives with nothing behind it, the safe direction of the two, since an
 * account with no rows cannot reach anything, and the next attempt finds it by
 * email and consumes it.
 */
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function ensureAuthUser(
  email: string,
  fullName: string,
  context: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!error && data.user) return data.user.id;

  const alreadyExists = /already|registered|exists/i.test(error?.message ?? '');
  if (!alreadyExists) {
    logger.error('auth_user_create_failed', { context, message: error?.message });
    throw new ApiError(
      502,
      'AUTH_UPSTREAM_ERROR',
      'Tidak bisa membuat akun. Coba lagi sebentar lagi.',
    );
  }

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    throw new ApiError(502, 'AUTH_UPSTREAM_ERROR', 'Tidak bisa memeriksa akun yang sudah ada.');
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    throw new ApiError(502, 'AUTH_UPSTREAM_ERROR', 'Akun tidak dapat dipastikan.');
  }
  return existing.id;
}
