'use client';

import type { ActionResult } from '@/lib/media-actions';

/**
 * Page and block actions, from the browser via the BFF (doc 14 §2.6).
 *
 * Note what is absent: submit, approve, publish, restore. A page is a
 * registered content type, so those are `site-actions.ts`, the same functions
 * articles and programmes use, against `/site/content/page/:id`.
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
    return { ok: false, error: issue ?? payload?.error?.message ?? 'Gagal menyimpan.' };
  } catch {
    return { ok: false, error: 'Tidak bisa terhubung ke server.' };
  }
}

export const createPage = (title: string) =>
  send<{ id: string; slug: string }>('/site/pages', 'POST', { title });

export const deletePage = (id: string) => send(`/site/pages/${id}`, 'DELETE');

export const addBlock = (pageId: string, type: string, props: Record<string, unknown>) =>
  send<{ id: string }>(`/site/pages/${pageId}/blocks`, 'POST', { type, props });

export const updateBlock = (
  pageId: string,
  blockId: string,
  patch: { props?: Record<string, unknown>; visible?: boolean },
) => send(`/site/pages/${pageId}/blocks/${blockId}`, 'PATCH', patch);

export const deleteBlock = (pageId: string, blockId: string) =>
  send(`/site/pages/${pageId}/blocks/${blockId}`, 'DELETE');

/** The whole ordered list, so the result is exactly what was on screen. */
export const reorderBlocks = (pageId: string, blockIds: string[]) =>
  send(`/site/pages/${pageId}/blocks/reorder`, 'PUT', { blockIds });

/**
 * Mint a preview link and build the URL the reviewer opens.
 *
 * The token comes back once and is never stored server-side in plaintext, so
 * this response is the only copy, which is why the URL is assembled here and
 * shown immediately rather than fetched again later.
 */
export async function mintPreview(
  pageId: string,
  siteUrl: string,
): Promise<ActionResult<{ url: string }>> {
  const result = await send<{ token: string; expiresAt: string }>(
    `/site/pages/${pageId}/preview`,
    'POST',
  );
  if (!result.ok || !result.data) return { ok: false, error: result.error };
  /**
   * The marketing origin is passed in from the server, not read from an env var
   * here. This app has no public site URL, only `LOGIN_URL`, which is
   * server-only, and inventing a `NEXT_PUBLIC_` twin would put a second copy
   * of the same fact in a second place to drift.
   */
  return {
    ok: true,
    data: { url: `${siteUrl}/preview?token=${encodeURIComponent(result.data.token)}` },
  };
}
