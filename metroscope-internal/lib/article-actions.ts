'use client';

import type { ActionResult } from '@/lib/media-actions';
import type { Article, ArticleCategory, ArticleTag, ProseNode } from '@/lib/api';

/**
 * Article actions, from the browser via the BFF.
 *
 * Note what is NOT here: submit, approve, publish, unpublish, archive, restore.
 * Those live in `site-actions.ts` and work on articles unchanged, because an
 * article is a registered content type rather than a parallel CMS. Adding
 * article-specific copies would be the first step towards two pipelines.
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

export const createArticle = (body: { title: string; categoryId?: string }) =>
  send<{ id: string; slug: string }>('/site/articles', 'POST', body);

export const deleteArticle = (id: string) => send(`/site/articles/${id}`, 'DELETE');

/**
 * Save the draft.
 *
 * Deliberately the SHARED content route, not an article one: the same endpoint
 * a programme edit goes through, with the article's schema resolved from the
 * registry on the server.
 */
export interface ArticleDraftPatch {
  title?: string;
  slug?: string;
  subtitle?: string | null;
  excerpt?: string | null;
  body?: ProseNode;
  coverId?: string | null;
  categoryId?: string | null;
  /** §3.7, the byline the auto-drafts arrive without. */
  authorId?: string | null;
  featured?: boolean;
  tagIds?: string[];
}

export const saveArticleDraft = (id: string, patch: ArticleDraftPatch) =>
  send<Article>(`/site/content/article/${id}`, 'PATCH', patch);

export const saveCategory = (body: Partial<ArticleCategory> & { name: string }, id?: string) =>
  send<{ id: string; slug: string }>(
    id ? `/site/categories/${id}` : '/site/categories',
    id ? 'PATCH' : 'POST',
    { name: body.name, description: body.description ?? null, orderIndex: body.orderIndex ?? 0 },
  );

export const deleteCategory = (id: string) => send(`/site/categories/${id}`, 'DELETE');

/** Create-or-return: the editor types a name and gets a tag either way. */
export const upsertTag = (name: string) =>
  send<ArticleTag & { created: boolean }>('/site/tags', 'POST', { name });

export const deleteTag = (id: string) => send(`/site/tags/${id}`, 'DELETE');

// ── programmes (doc 14 §2.5) ─────────────────────────────────────────────

/**
 * Deliberately in this file, beside the article actions, because they share the
 * one thing that matters: neither owns a pipeline. Both save through
 * `/site/content/:type/:id`, and both leave submit/approve/publish to
 * `site-actions.ts`.
 */
export interface ProgramDraftPatch {
  name?: string;
  slug?: string;
  summary?: string | null;
  description?: string | null;
  body?: string | null;
  category?: 'ACADEMIC' | 'NON_ACADEMIC' | 'CREATIVE';
  levels?: string[];
  durationMonths?: number;
  cadence?: string | null;
  priceMonthly?: number;
  coverId?: string | null;
}

export const saveProgramDraft = (id: string, patch: ProgramDraftPatch) =>
  send(`/site/content/program/${id}`, 'PATCH', patch);

export const createProgram = (body: {
  name: string;
  category: string;
  levels: string[];
  priceMonthly: number;
}) => send<{ id: string; slug: string }>('/site/programs', 'POST', body);

export const deleteProgram = (id: string) => send(`/site/programs/${id}`, 'DELETE');
