import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type { ContentTx } from '../content/content.registry';
import { syncMediaUsage } from '../media/media.usage';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Article-derived state (doc 13 §10.4, doc 14 §2.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything here is computed from an article's body or kept in step with it.
 * It lives beside the article, not inside the pipeline: `content.service.ts`
 * knows only that some types have derived state, never what an article is.
 *
 * This file is imported by the registry, so it must not import the pipeline
 * back, hence the `ContentTx` type alias rather than a service import.
 */

/**
 * TipTap / ProseMirror node.
 *
 * Validated structurally rather than exhaustively: a schema listing every node
 * type would have to be edited every time the editor gains an extension, and
 * would reject documents the editor itself produces. What matters for safety is
 * that it is a `doc`, that it nests finitely, and that it carries no HTML, the
 * renderer walks nodes, so an unknown type renders as nothing, not as markup.
 */
const NODE_DEPTH_LIMIT = 20;

export interface ProseNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const ProseDoc: z.ZodType<ProseNode> = z.lazy(() =>
  z
    .object({
      type: z.string().max(60).optional(),
      text: z.string().optional(),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(ProseDoc).optional(),
      marks: z
        .array(
          z.object({
            type: z.string().max(60),
            attrs: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .optional(),
    })
    .strict(),
);

export const ArticleDraftBody = z
  .object({
    title: z.string().min(3).max(200).optional(),
    slug: z
      .string()
      .min(2)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung')
      .optional(),
    subtitle: z.string().max(300).nullable().optional(),
    excerpt: z.string().max(500).nullable().optional(),
    body: ProseDoc.optional(),
    coverId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    authorId: z.string().uuid().nullable().optional(),
    featured: z.boolean().optional(),
    pinnedRank: z.number().int().min(0).max(9999).nullable().optional(),
    studentId: z.string().uuid().nullable().optional(),
    programId: z.string().uuid().nullable().optional(),
    competitionId: z.string().uuid().nullable().optional(),
    /**
     * §3.7, the consent record, editable exactly like a testimonial's.
     *
     * Where the consent came from, in the editor's own words ("WhatsApp Bu Rani
     * 3 Agu 2026", "formulir izin ditandatangani"). Free text on purpose: the
     * point is that a human recorded a real conversation, and an enum of
     * channels would invite picking one without having had it.
     */
    consentSource: z.string().max(300).nullable().optional(),
    consentAt: z.coerce.date().nullable().optional(),
    locale: z.enum(['id', 'en']).optional(),
    /**
     * Virtual: tags live in a join table, not a column. The pipeline skips any
     * field without a column and lets this hook apply it.
     */
    tagIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .strict();

export type ArticleDraftInput = z.infer<typeof ArticleDraftBody>;

/** Words per minute for Indonesian prose. Rounded up, floor of one minute. */
const WPM = 200;

export function walk(node: ProseNode, visit: (n: ProseNode) => void, depth = 0): void {
  if (depth > NODE_DEPTH_LIMIT) {
    throw new ApiError(422, 'BODY_TOO_DEEP', 'Struktur artikel terlalu dalam.');
  }
  visit(node);
  for (const child of node.content ?? []) walk(child, visit, depth + 1);
}

export function readingMinutes(doc: ProseNode): number {
  let words = 0;
  walk(doc, (n) => {
    if (typeof n.text === 'string') {
      const trimmed = n.text.trim();
      if (trimmed) words += trimmed.split(/\s+/).length;
    }
  });
  return Math.max(1, Math.ceil(words / WPM));
}

/**
 * Every media asset the body embeds.
 *
 * The picker writes the asset id into the node's attrs, so an embedded image is
 * found by id rather than by parsing a URL, a signed URL expires and a public
 * one can be rewritten, but the id is what `media_usage` is about.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function embeddedMediaIds(doc: ProseNode): string[] {
  const ids = new Set<string>();
  walk(doc, (n) => {
    const id = n.attrs?.mediaId;
    if (typeof id === 'string' && UUID_RE.test(id)) ids.add(id);
  });
  return [...ids];
}

/**
 * The registry's `onDraftUpdate` hook for articles.
 *
 * Runs inside the pipeline's transaction, so the tags, the usage rows and the
 * article itself commit together or not at all.
 */
export async function syncArticleDerived(
  tx: ContentTx,
  _ctx: RequestContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const derived: Record<string, SQL | number> = {};
  const input = patch as ArticleDraftInput;

  // ── tags (virtual field: a join table, not a column) ──
  if (input.tagIds) {
    const tagIds = input.tagIds;
    if (tagIds.length === 0) {
      await tx.execute(sql`DELETE FROM article_tags WHERE article_id = ${id}`);
    } else {
      const list = sql.join(
        tagIds.map((t) => sql`${t}::uuid`),
        sql`, `,
      );
      await tx.execute(sql`
        DELETE FROM article_tags WHERE article_id = ${id} AND tag_id NOT IN (${list})
      `);
      await tx.execute(sql`
        INSERT INTO article_tags (article_id, tag_id)
        SELECT ${id}, t.id FROM tags t WHERE t.id IN (${list})
        ON CONFLICT DO NOTHING
      `);
    }
  }

  /**
   * The body drives reading time and embedded usage, so both are recomputed
   * whenever it changes, and only then. Recomputing on a title-only edit
   * would need a second read of the body for no reason.
   */
  if (input.body) {
    const doc = input.body;
    if (doc.type !== 'doc') {
      throw new ApiError(422, 'INVALID_BODY', 'Isi artikel harus dokumen TipTap.');
    }
    derived.reading_min = readingMinutes(doc);
    /**
     * Serialised here and cast explicitly. Left to the driver, a JS object
     * reaches Postgres as an untyped literal and the jsonb coercion depends on
     * inference, the failure mode that bit the outbox payload in Phase 1.
     */
    derived.body = sql`${JSON.stringify(doc)}::jsonb`;
  }

  /**
   * The cover is media usage too, so replacing it must release the old image.
   * Reconciled together with the embedded set: they share one `media_usage`
   * scope per article, and syncing them separately would have each delete the
   * other's rows.
   */
  if (input.body !== undefined || input.coverId !== undefined) {
    const current = await tx.execute<{ body: ProseNode; cover_id: string | null }>(sql`
      SELECT body, cover_id FROM articles WHERE id = ${id}
    `);
    const row = (Array.from(current) as { body: ProseNode; cover_id: string | null }[]).at(0);
    const doc = input.body ?? row?.body ?? { type: 'doc', content: [] };
    const cover = input.coverId !== undefined ? input.coverId : (row?.cover_id ?? null);

    const uses: { assetId: string; field: string }[] = embeddedMediaIds(doc).map((assetId) => ({
      assetId,
      field: 'body',
    }));
    if (cover) uses.push({ assetId: cover, field: 'cover' });
    await syncMediaUsage(tx, 'article', id, uses);
  }

  return derived;
}

/**
 * An article may not be submitted for review without an excerpt.
 *
 * Migration 0014 said "the pipeline enforces it at SUBMIT rather than at
 * INSERT, a draft you have just started legitimately has no excerpt yet", and
 * nothing ever implemented it. §2.7 added the registry's `beforeTransition`
 * hook for testimonial consent, which gave this a home too.
 *
 * The excerpt is the card copy AND the meta description, so an article without
 * one renders an empty card and lets a search engine invent the snippet.
 * Catching it at submit puts the fix in the author's hands, where it belongs,
 * instead of in the reviewer's.
 */
export async function assertArticleReady(
  tx: ContentTx,
  id: string,
  _action: string,
  nextStatus: string,
): Promise<void> {
  if (nextStatus !== 'IN_REVIEW' && nextStatus !== 'PUBLISHED') return;

  const rows = await tx.execute<{
    excerpt: string | null;
    studentId: string | null;
    consentSource: string | null;
    authorId: string | null;
  }>(sql`
    SELECT excerpt,
           student_id     AS "studentId",
           consent_source AS "consentSource",
           author_id      AS "authorId"
    FROM articles WHERE id = ${id}
  `);
  const row = (
    Array.from(rows) as {
      excerpt: string | null;
      studentId: string | null;
      consentSource: string | null;
      authorId: string | null;
    }[]
  ).at(0);

  if (!row?.excerpt?.trim()) {
    throw new ApiError(
      422,
      'EXCERPT_REQUIRED',
      'Tulis ringkasan dulu, dipakai di kartu artikel dan hasil pencarian Google.',
    );
  }

  /**
   * A byline, checked at SUBMIT alongside the excerpt.
   *
   * doc 13 §10.5 wants a real one for E-E-A-T, and §3.7's auto-draft
   * deliberately leaves `author_id` NULL: the mentor who recorded the win did
   * not write the article, and crediting them would be a lie in the one field
   * search engines read as a claim about who did.
   *
   * At SUBMIT and not at PUBLISH, because the only route out of APPROVED is
   * forward. `reject` runs from IN_REVIEW only, so an approved article with an
   * empty byline would be unpublishable and unfixable, a gate that creates a
   * dead end is a worse gate than none. Authorship is a drafting decision, so
   * it is asked for while the piece is still a draft.
   *
   * Nothing is lost by not re-checking at PUBLISH: `publish` runs from APPROVED
   * or SCHEDULED, and the only way into either is through IN_REVIEW, which this
   * gate already closed. Repeating it would only catch rows written around the
   * API, and would strand them.
   */
  if (nextStatus === 'IN_REVIEW') {
    if (!row.authorId) {
      throw new ApiError(
        422,
        'AUTHOR_REQUIRED',
        'Tentukan penulis artikel dulu, nama penulis tampil di halaman publik.',
      );
    }
    return;
  }

  /**
   * An article that NAMES A CHILD may not be published without a recorded
   * consent source (doc 13 §9.4, doc 14 §3.7).
   *
   * The same rule `assertTestimonialConsent` enforces, and for a stronger
   * reason: a testimonial is a parent talking, an achievement article is the
   * minor themselves, name, school, placing, date, on the open web, findable
   * by anyone who searches the name for the next decade.
   *
   * Keyed on `student_id`, not on how the row was created. An editor writing a
   * profile piece by hand publishes exactly the same thing as the §3.7 trigger
   * drafts, and a rule that only caught the generated ones would be a rule
   * about provenance rather than about whose name is on it.
   *
   * At PUBLISHED only. An article moves through DRAFT and IN_REVIEW while
   * somebody is still asking the family, blocking the review step would stop
   * the Editor doing the work that produces the conversation.
   */
  if (row.studentId && !row.consentSource?.trim()) {
    throw new ApiError(
      422,
      'CONSENT_REQUIRED',
      'Artikel ini menyebut nama siswa. Catat izin orang tua dulu sebelum diterbitkan.',
    );
  }
}
