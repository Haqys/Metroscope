import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Templating. Copy lives in the database; rendering lives here.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `notification_templates` holds subject and body per `code`, so the Head can
 * fix a typo through /settings without a deploy. Rendering stays in code because
 * a template language stored in a database is a template language somebody can
 * inject into.
 *
 * Substitution is `{{key}}` against a flat, pre-escaped map. Nothing else, no
 * conditionals, no loops, no expression evaluation. A notification that needs
 * branching needs two templates.
 *
 * End-user copy is Indonesian; code and keys are English (CLAUDE.md).
 */

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/** HTML-escape. Recipient names and school names are user-supplied. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace `{{key}}` from `vars`.
 *
 * An unknown placeholder renders as an empty string rather than staying literal:
 * "Halo {{parentName}}" reaching a parent is worse than "Halo". Missing keys are
 * returned so the caller can log them, silently sending half-filled copy is how
 * a template bug survives for months.
 */
function interpolate(
  template: string,
  vars: Record<string, string>,
  escape: boolean,
): { out: string; missing: string[] } {
  const missing: string[] = [];
  const out = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      missing.push(key);
      return '';
    }
    return escape ? escapeHtml(value) : value;
  });
  return { out, missing };
}

/**
 * Minimal HTML wrapper.
 *
 * Deliberately plain: inline styles, a single column, no images and no external
 * CSS. Every one of those is a spam signal or a rendering hazard in Gmail and
 * Outlook, and this channel has no fallback if a message is filtered.
 */
function wrapHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return [
    '<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#f6f7f9">',
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;',
    'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1f2937">',
    '<div style="font-weight:700;font-size:18px;color:#0f172a;margin-bottom:24px">Metroscope</div>',
    paragraphs,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">',
    '<div style="font-size:12px;color:#6b7280">Email ini dikirim otomatis oleh sistem Metroscope.</div>',
    '</div></body></html>',
  ].join('');
}

/** Index signature required by drizzle's `execute<T>` row constraint. */
export interface TemplateRow extends Record<string, unknown> {
  code: string;
  subject: string | null;
  body: string;
  isActive: boolean;
}

/**
 * Load an active template by code.
 *
 * Owner connection: the dispatcher runs as a job with no caller, and templates
 * are staff-only under RLS.
 */
export async function loadTemplate(code: string): Promise<TemplateRow | null> {
  const rows = await db.execute<TemplateRow>(sql`
    SELECT code, subject, body, is_active AS "isActive"
    FROM notification_templates
    WHERE code = ${code} AND channel = 'EMAIL' AND is_active = true
  `);
  return (Array.from(rows) as TemplateRow[]).at(0) ?? null;
}

export function render(
  template: TemplateRow,
  vars: Record<string, string>,
): RenderedTemplate & { missing: string[] } {
  const subject = interpolate(template.subject ?? 'Metroscope', vars, false);
  const text = interpolate(template.body, vars, false);
  const html = interpolate(template.body, vars, true);

  return {
    subject: subject.out,
    text: text.out,
    html: wrapHtml(html.out),
    missing: [...new Set([...subject.missing, ...text.missing])],
  };
}
