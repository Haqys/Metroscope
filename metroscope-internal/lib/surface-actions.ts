'use client';

import type { ActionResult } from '@/lib/media-actions';

/**
 * FAQ, testimonial and mentor actions, from the browser via the BFF (§2.7).
 *
 * Absent again: submit, approve, publish, restore. All three are registered
 * content types, so those live in `site-actions.ts` against
 * `/site/content/:type/:id`, the same functions articles, programmes and pages
 * already use.
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

export const saveSurfaceDraft = (type: string, id: string, patch: Record<string, unknown>) =>
  send(`/site/content/${type}/${id}`, 'PATCH', patch);

export const createFaq = (question: string, answer: string) =>
  send<{ id: string }>('/site/surfaces/faq', 'POST', { question, answer });

export const createTestimonial = (quote: string, authorName: string) =>
  send<{ id: string }>('/site/surfaces/testimonial', 'POST', { quote, authorName });

export const createMentor = (userId: string, displayName: string) =>
  send<{ id: string; slug: string }>('/site/surfaces/mentor', 'POST', { userId, displayName });

export const markSubmissionHandled = (id: string, handled: boolean) =>
  send(`/site/forms/${id}`, 'PATCH', { handled });

/**
 * SEO overrides (§2.8). A PUT, not a PATCH, `seo_meta` is one row of optional
 * overrides and the panel always sends all of them, so "clear this field" and
 * "leave it alone" stay distinguishable. A PATCH would make an omitted field
 * ambiguous, which is how a canonical URL becomes impossible to remove.
 */
export const saveContentSeo = (type: string, id: string, seo: Record<string, unknown>) =>
  send(`/site/content/${type}/${id}/seo`, 'PUT', seo);

/**
 * Record parental consent before a child's name goes public (§3.7).
 *
 * Beside `saveContentSeo` and for the same structural reason: both are
 * publication metadata rather than draft content, so both are editable at any
 * status and both are gated by `content.publish`.
 */
export const saveContentConsent = (type: string, id: string, source: string | null) =>
  send<{ id: string; consentSource: string | null }>(`/site/content/${type}/${id}/consent`, 'PUT', {
    source,
  });
