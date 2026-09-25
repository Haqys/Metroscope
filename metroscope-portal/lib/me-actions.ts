'use client';

import type { Achievements, MyProfile, NotificationItem } from '@/lib/api';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * The caller's own account, from the browser via the BFF (doc 04 §0.4).
 *
 * Never `api.metroscope.id` directly: the access token lives in an HttpOnly
 * cookie and is attached by `/api/bff/*` on this origin, so browser JavaScript
 * never holds it and an XSS cannot become account takeover.
 *
 * Authorised by OWNERSHIP throughout. `users_update_self`, `notifications_update`
 * and `app.update_student_self()` each check the caller against the row, so
 * there is nothing for this module to enforce and it must not pretend
 * otherwise: a check here would be a second, weaker copy of the rule.
 */
async function send<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
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
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan perubahan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

// ── profile ──────────────────────────────────────────────────────────────

export const updateProfile = (body: {
  fullName?: string;
  displayName?: string | null;
  phone?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
}) => send<MyProfile>('/me/profile', 'PATCH', body);

export const updatePreferences = (
  preferences: Array<{ channel: 'EMAIL' | 'IN_APP'; category: string; enabled: boolean }>,
) => send<MyProfile>('/me/preferences', 'PUT', { preferences });

/** The three fields a guardian owns on their own child (FR-SET-1..3). */
export const updateStudentSettings = (
  studentId: string,
  body: { parentName?: string | null; parentPhone?: string | null; showOnLeaderboard?: boolean },
) => send(`/me/students/${studentId}`, 'PATCH', body);

// ── avatar ───────────────────────────────────────────────────────────────

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Upload a new profile photo and point the account at it.
 *
 * Three steps, and the middle one does NOT go through the BFF: the API returns
 * a signed URL and the browser PUTs the bytes straight to Supabase Storage. A
 * 5 MB image relayed through a serverless function would spend that function's
 * whole request body budget to achieve nothing, and the signed URL is scoped to
 * one key that the API derived from the caller's own user id.
 *
 * The size and type are checked here for a fast, kind error message and again
 * by the API, which is the check that counts. This one is a courtesy.
 */
export async function uploadAvatar(file: File): Promise<ActionResult<{ photoUrl: string }>> {
  if (!(ALLOWED as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Format foto harus JPG, PNG, atau WebP.' };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: `Ukuran maksimal 5 MB, file ini ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
    };
  }

  const signed = await send<{ storageKey: string; uploadUrl: string; token: string }>(
    '/me/photo',
    'POST',
    { filename: file.name, contentType: file.type, size: file.size },
  );
  if (!signed.ok || !signed.data)
    return { ok: false, error: signed.error ?? 'Gagal menyiapkan unggahan.' };

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

  const confirmed = await send<MyProfile>('/me/photo/confirm', 'POST', {
    storageKey: signed.data.storageKey,
  });
  if (!confirmed.ok || !confirmed.data) {
    return { ok: false, error: confirmed.error ?? 'Foto terunggah tetapi gagal disimpan.' };
  }

  return { ok: true, data: { photoUrl: confirmed.data.photoUrl ?? '' } };
}

// ── notifications ────────────────────────────────────────────────────────

export async function fetchNotifications(
  limit = 20,
): Promise<ActionResult<{ items: NotificationItem[]; unread: number }>> {
  return send<{ items: NotificationItem[]; unread: number }>(
    `/me/notifications?limit=${limit}`,
    'GET',
  );
}

export const markNotificationRead = (id: string) => send(`/me/notifications/${id}/read`, 'POST');

export const markAllNotificationsRead = () =>
  send<{ marked: number }>('/me/notifications/read-all', 'POST');

export const fetchAchievements = () => send<Achievements>('/me/achievements', 'GET');
