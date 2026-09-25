'use client';

/**
 * The signed-in staff member's own profile, from the browser via the BFF.
 *
 * `/v1/me/profile` and `/v1/me/photo` are role-neutral by design: every
 * account owns its own row, whatever it does here, and `users_update_self` is
 * the gate. A Mentor, a Finance officer and the Head all reach the same three
 * endpoints, which is why there is no staff-specific variant of them.
 *
 * The photo bytes do NOT go through the BFF. The API hands back a signed URL
 * scoped to a key it derived from the caller's own user id, and the browser
 * PUTs straight to storage; relaying a 5 MB image through a serverless
 * function would spend that function's whole body budget to achieve nothing.
 */
export interface ProfileActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface StaffProfile {
  id: string;
  email: string | null;
  fullName: string;
  displayName: string | null;
  phone: string | null;
  photoUrl: string | null;
  bio: string | null;
}

async function send<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<ProfileActionResult<T>> {
  try {
    const res = await fetch(`/api/bff${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: T;
      error?: { message?: string; details?: { issues?: Array<{ message: string }> } };
    } | null;

    if (res.ok) return { ok: true, data: payload?.data };
    const issue = payload?.error?.details?.issues?.[0]?.message;
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan profil.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

export const updateOwnProfile = (body: {
  fullName?: string;
  displayName?: string | null;
  phone?: string | null;
  bio?: string | null;
}) => send<StaffProfile>('/me/profile', 'PATCH', body);

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function uploadOwnAvatar(
  file: File,
): Promise<ProfileActionResult<{ photoUrl: string }>> {
  if (!(ALLOWED as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Format foto harus JPG, PNG, atau WebP.' };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: `Ukuran maksimal 5 MB, file ini ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
    };
  }

  const signed = await send<{ storageKey: string; uploadUrl: string }>('/me/photo', 'POST', {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  if (!signed.ok || !signed.data) {
    return { ok: false, error: signed.error ?? 'Gagal menyiapkan unggahan.' };
  }

  try {
    const put = await fetch(signed.data.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
    if (!put.ok) return { ok: false, error: 'Gagal mengunggah foto. Coba lagi.' };
  } catch {
    return { ok: false, error: 'Gagal mengunggah foto. Periksa koneksi Anda.' };
  }

  const confirmed = await send<StaffProfile>('/me/photo/confirm', 'POST', {
    storageKey: signed.data.storageKey,
  });
  if (!confirmed.ok || !confirmed.data) {
    return { ok: false, error: confirmed.error ?? 'Foto terunggah tetapi gagal disimpan.' };
  }
  return { ok: true, data: { photoUrl: confirmed.data.photoUrl ?? '' } };
}
