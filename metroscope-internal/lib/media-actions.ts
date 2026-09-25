'use client';

import type { MediaAsset } from '@/lib/api';

/**
 * Media library actions, from the browser via the BFF.
 *
 * The upload is a three-step dance and it is worth naming why: the file goes
 * DIRECTLY from the browser to storage using a short-lived signed URL, never
 * through our API. Proxying 10 MB through a serverless function costs an
 * invocation's memory and time for nothing, and the key is server-chosen so a
 * caller cannot aim an upload at somebody else's path.
 *
 *   1. POST /site/media        → reserve a PENDING row, get a signed URL
 *   2. PUT  <signed url>       → the bytes, straight to the bucket
 *   3. POST /site/media/:id/confirm → verify the object landed, join the library
 *
 * Step 3 is what keeps a failed upload out of the library. Without it an
 * interrupted transfer leaves a row that looks perfectly normal and renders as
 * a broken image the first time somebody places it.
 */
export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

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
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal.' };
  } catch {
    return { ok: false, error: 'Tidak bisa menghubungi server. Coba lagi.' };
  }
}

/** SHA-256 of the file, so re-uploading the same image finds the existing one. */
async function checksumOf(file: File): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Not available over plain HTTP on some hosts. Dedupe is a nicety.
    return undefined;
  }
}

/** Intrinsic pixels, so the CMS can warn about images too small for a hero. */
async function dimensionsOf(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith('image/')) return {};
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

export async function uploadMedia(
  file: File,
  opts: { title?: string; folder?: string } = {},
): Promise<ActionResult<MediaAsset>> {
  const checksum = await checksumOf(file);

  const reserved = await send<{
    deduplicated: boolean;
    asset?: MediaAsset;
    assetId?: string;
    uploadUrl?: string;
  }>('/site/media', 'POST', {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    title: opts.title ?? file.name,
    folder: opts.folder,
    checksum,
  });

  if (!reserved.ok) return { ok: false, error: reserved.error };

  // Already in the library, hand back the existing asset rather than a twin.
  if (reserved.data?.deduplicated && reserved.data.asset) {
    return { ok: true, data: reserved.data.asset };
  }

  const { assetId, uploadUrl } = reserved.data ?? {};
  if (!assetId || !uploadUrl) return { ok: false, error: 'Gagal menyiapkan unggahan.' };

  try {
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
    if (!put.ok) {
      return { ok: false, error: `Unggahan gagal (${put.status}). Coba lagi.` };
    }
  } catch {
    return { ok: false, error: 'Unggahan terputus. Periksa koneksi, lalu coba lagi.' };
  }

  const dims = await dimensionsOf(file);
  return send<MediaAsset>(`/site/media/${assetId}/confirm`, 'POST', dims);
}

/** Swap the bytes behind an existing asset, keeping every reference intact. */
export async function replaceMedia(id: string, file: File): Promise<ActionResult<MediaAsset>> {
  const reserved = await send<{ uploadUrl: string; storageKey: string }>(
    `/site/media/${id}/replace`,
    'POST',
    { filename: file.name, mimeType: file.type, sizeBytes: file.size },
  );
  if (!reserved.ok || !reserved.data) return { ok: false, error: reserved.error };

  try {
    const put = await fetch(reserved.data.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
    if (!put.ok) return { ok: false, error: `Unggahan gagal (${put.status}).` };
  } catch {
    return { ok: false, error: 'Unggahan terputus.' };
  }

  const dims = await dimensionsOf(file);
  return send<MediaAsset>(`/site/media/${id}/replace/confirm`, 'POST', {
    storageKey: reserved.data.storageKey,
    mimeType: file.type,
    sizeBytes: file.size,
    ...dims,
  });
}

export const updateMedia = (id: string, patch: Record<string, unknown>) =>
  send<MediaAsset>(`/site/media/${id}`, 'PATCH', patch);

/** Soft delete. `force` only after the caller has seen the usage list. */
export const deleteMedia = (id: string, force = false) =>
  send(`/site/media/${id}${force ? '?force=true' : ''}`, 'DELETE');

export const restoreMedia = (id: string) => send(`/site/media/${id}/restore`, 'POST');

/** Irreversible. Only from the recycle bin, only when nothing points at it. */
export const purgeMedia = (id: string) => send(`/site/media/${id}/purge`, 'POST');
