import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { asUser, asAnon, withElevatedPrivileges } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import { publicUrl } from '../media/media.service';
import { resolveBlockType } from './blocks.registry';
import { syncPageMedia } from './pages.derive';
import type {
  CreateBlockInput,
  CreatePageInput,
  ReorderBlocksInput,
  UpdateBlockInput,
} from './pages.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pages and their blocks (doc 13 §9.3, doc 14 §2.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What is NOT here: submit, approve, schedule, publish, unpublish, archive,
 * versions, restore, the 301 on rename, and the page row's own PATCH. A page is
 * a registered content type, so all of that is `modules/content`, unchanged.
 *
 * What IS here is the part a page has and the other types do not: an ordered
 * list of typed blocks, and the preview that lets somebody read the draft.
 */

/** Blocks are spaced so a reorder rewrites only the rows that moved. */
const ORDER_GAP = 100;

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

/**
 * Only a DRAFT page accepts block edits.
 *
 * Exactly the rule `updateDraft` applies to a page's own fields, restated here
 * because blocks have their own endpoints. Without it the pipeline would guard
 * the title while the blocks. Everything a visitor actually reads, stayed
 * editable on a live page, and the reviewer's approval would mean nothing.
 */
async function lockDraftPage(tx: Tx, pageId: string) {
  const rows = await tx.execute<{ id: string; status: string }>(sql`
    SELECT id, status::text AS status FROM pages WHERE id = ${pageId} FOR UPDATE
  `);
  const row = (Array.from(rows) as { id: string; status: string }[]).at(0);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.');
  if (row.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'NOT_EDITABLE',
      `Hanya draf yang bisa diubah. Status sekarang ${row.status}.`,
    );
  }
  return row;
}

/** Validate `props` against the schema the registry holds for `type`. */
function validateProps(type: string, props: unknown) {
  const block = resolveBlockType(type);
  if (!block) throw new ApiError(422, 'UNKNOWN_BLOCK_TYPE', `Jenis blok "${type}" tidak dikenal.`);
  return block.schema.parse(props ?? {});
}

export async function createPage(ctx: RequestContext, input: CreatePageInput) {
  const slug = (input.slug ?? input.title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  const created = await asUser(ctx, async (tx) => {
    /**
     * A page slug is a URL on the marketing site, so a clash is a 409 rather
     * than a numbered suffix. `/about-2` is not a page anybody meant to make.
     */
    const clash = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM pages WHERE slug = ${slug} AND locale = 'id'
    `);
    if (((Array.from(clash) as { n: number }[]).at(0)?.n ?? 0) > 0) {
      throw new ApiError(409, 'SLUG_TAKEN', `Alamat "/${slug}" sudah dipakai halaman lain.`);
    }

    const rows = await tx.execute<{ id: string; slug: string }>(sql`
      INSERT INTO pages (title, slug) VALUES (${input.title}, ${slug || 'halaman'})
      RETURNING id, slug
    `);
    const row = (Array.from(rows) as { id: string; slug: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat halaman.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'page',
    entityId: created.id,
    after: { title: input.title, slug: created.slug, status: 'DRAFT' },
  });

  return { id: created.id, slug: created.slug, status: 'DRAFT' as const };
}

const BLOCK_COLUMNS = sql`
  b.id, b.type, b.props, b.order_index AS "orderIndex", b.visible,
  b.visible_from AS "visibleFrom", b.visible_until AS "visibleUntil"
`;

/** One page with every block, in order, the editor's read and its preview. */
export async function getPageForEditor(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT p.id, p.slug, p.title, p.description, p.locale,
             p.status::text AS status, p.version,
             p.publish_at AS "publishAt", p.published_at AS "publishedAt",
             p.review_note AS "reviewNote", p.updated_at AS "updatedAt"
      FROM pages p WHERE p.id = ${id}
    `);
    const page = (Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!page) throw new ApiError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.');

    const blocks = await tx.execute(sql`
      SELECT ${BLOCK_COLUMNS} FROM page_blocks b
      WHERE b.page_id = ${id} ORDER BY b.order_index, b.id
    `);
    return { ...page, blocks: Array.from(blocks) };
  });
}

export async function addBlock(ctx: RequestContext, pageId: string, input: CreateBlockInput) {
  const props = validateProps(input.type, input.props);

  const created = await asUser(ctx, async (tx) => {
    await lockDraftPage(tx, pageId);

    /**
     * Insert exactly midway after the chosen block, or at the end.
     *
     * The gap is what makes this one INSERT instead of a renumber: dropping a
     * block between two others uses the space already there. If the gap ever
     * closes, after enough insertions in one spot, the reorder endpoint
     * renumbers cleanly, so the degenerate case is recoverable rather than
     * fatal.
     */
    const orderRows = await tx.execute<{ next: number }>(
      input.afterBlockId
        ? sql`
            WITH anchor AS (
              SELECT order_index AS oi FROM page_blocks
              WHERE id = ${input.afterBlockId} AND page_id = ${pageId}
            ),
            following AS (
              SELECT MIN(b.order_index) AS oi FROM page_blocks b, anchor a
              WHERE b.page_id = ${pageId} AND b.order_index > a.oi
            )
            SELECT COALESCE(
              (SELECT (a.oi + f.oi) / 2 FROM anchor a, following f WHERE f.oi IS NOT NULL),
              (SELECT a.oi + ${ORDER_GAP} FROM anchor a)
            )::int AS next`
        : sql`
            SELECT COALESCE(MAX(order_index) + ${ORDER_GAP}, 0)::int AS next
            FROM page_blocks WHERE page_id = ${pageId}`,
    );
    const next = (Array.from(orderRows) as { next: number }[]).at(0)?.next ?? 0;

    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO page_blocks (page_id, type, props, order_index)
      VALUES (${pageId}, ${input.type}, ${JSON.stringify(props)}::jsonb, ${next})
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah halaman ini.');

    await syncPageMedia(tx, pageId);
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.update',
    entity: 'page',
    entityId: pageId,
    after: { blockAdded: input.type, blockId: created.id },
  });

  return { id: created.id, type: input.type };
}

export async function updateBlock(
  ctx: RequestContext,
  pageId: string,
  blockId: string,
  input: UpdateBlockInput,
) {
  await asUser(ctx, async (tx) => {
    await lockDraftPage(tx, pageId);

    const existing = await tx.execute<{ type: string }>(sql`
      SELECT type FROM page_blocks WHERE id = ${blockId} AND page_id = ${pageId}
    `);
    const block = (Array.from(existing) as { type: string }[]).at(0);
    if (!block) throw new ApiError(404, 'NOT_FOUND', 'Blok tidak ditemukan.');

    const sets = [];
    if (input.props !== undefined) {
      // Re-validated against the block's OWN type, which the caller cannot
      // change, so props can never be saved against a different schema.
      const props = validateProps(block.type, input.props);
      sets.push(sql`props = ${JSON.stringify(props)}::jsonb`);
    }
    if (input.visible !== undefined) sets.push(sql`visible = ${input.visible}`);
    if (input.visibleFrom !== undefined) sets.push(sql`visible_from = ${input.visibleFrom}`);
    if (input.visibleUntil !== undefined) sets.push(sql`visible_until = ${input.visibleUntil}`);
    if (sets.length === 0) throw new ApiError(422, 'NO_CHANGES', 'Tidak ada perubahan.');
    sets.push(sql`updated_at = now()`);

    await tx.execute(sql`
      UPDATE page_blocks SET ${sql.join(sets, sql`, `)}
      WHERE id = ${blockId} AND page_id = ${pageId}
    `);
    await syncPageMedia(tx, pageId);
  });

  await writeAuditLog({
    ctx,
    action: 'content.update',
    entity: 'page',
    entityId: pageId,
    after: { blockUpdated: blockId },
  });

  return { id: blockId, updated: true };
}

export async function deleteBlock(ctx: RequestContext, pageId: string, blockId: string) {
  await asUser(ctx, async (tx) => {
    await lockDraftPage(tx, pageId);
    const rows = await tx.execute<{ id: string }>(sql`
      DELETE FROM page_blocks WHERE id = ${blockId} AND page_id = ${pageId} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Blok tidak ditemukan.');
    }
    // The removed block may have held the only reference to a picture.
    await syncPageMedia(tx, pageId);
  });

  await writeAuditLog({
    ctx,
    action: 'content.update',
    entity: 'page',
    entityId: pageId,
    after: { blockDeleted: blockId },
  });

  return { id: blockId, deleted: true };
}

export async function reorderBlocks(
  ctx: RequestContext,
  pageId: string,
  input: ReorderBlocksInput,
) {
  await asUser(ctx, async (tx) => {
    await lockDraftPage(tx, pageId);

    /**
     * The submitted list must be exactly this page's blocks.
     *
     * A partial list would renumber some and leave others at their old index,
     * silently interleaving them; a list containing a block from another page
     * would be a cross-page write. Both are rejected by comparing the set.
     */
    const current = await tx.execute<{ id: string }>(sql`
      SELECT id FROM page_blocks WHERE page_id = ${pageId}
    `);
    const owned = new Set((Array.from(current) as { id: string }[]).map((r) => r.id));
    const given = new Set(input.blockIds);
    if (owned.size !== given.size || [...given].some((id) => !owned.has(id))) {
      throw new ApiError(
        422,
        'BLOCK_SET_MISMATCH',
        'Urutan harus memuat tepat semua blok di halaman ini.',
      );
    }

    // Renumber from the gap, which also repairs any exhausted spacing.
    for (const [i, blockId] of input.blockIds.entries()) {
      await tx.execute(sql`
        UPDATE page_blocks SET order_index = ${(i + 1) * ORDER_GAP}, updated_at = now()
        WHERE id = ${blockId} AND page_id = ${pageId}
      `);
    }
  });

  await writeAuditLog({
    ctx,
    action: 'content.update',
    entity: 'page',
    entityId: pageId,
    after: { reordered: input.blockIds.length },
  });

  return { ordered: input.blockIds.length };
}

export async function deletePage(ctx: RequestContext, id: string) {
  const removed = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ status: string; version: number; title: string }>(sql`
      SELECT status::text AS status, version, title FROM pages WHERE id = ${id} FOR UPDATE
    `);
    const row = (Array.from(rows) as { status: string; version: number; title: string }[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.');
    if (row.status !== 'DRAFT' || row.version > 0) {
      throw new ApiError(
        409,
        'NOT_DELETABLE',
        'Hanya draf yang belum pernah terbit bisa dihapus. Gunakan arsip untuk halaman yang sudah tayang.',
      );
    }
    // `page_blocks` cascades; `media_usage` does not, so release it explicitly.
    await tx.execute(sql`DELETE FROM media_usage WHERE entity_type = 'page' AND entity_id = ${id}`);
    await tx.execute(sql`DELETE FROM pages WHERE id = ${id}`);
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.delete',
    entity: 'page',
    entityId: id,
    before: { title: removed.title, status: removed.status },
  });

  return { id, deleted: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Preview (doc 13 §9.5)
// ═══════════════════════════════════════════════════════════════════════════

const PREVIEW_TTL_MIN = 60;

/**
 * Dates cross this boundary as ISO strings, never as `Date` objects.
 *
 * Interpolated directly, the driver renders a Date with `toString()`,
 * `Sat Aug 08 2026 03:47:41 GMT+0800 (Central Indonesia Time)`, and Postgres
 * rejects the trailing timezone NAME. It is the same failure mode as the
 * timestamps in §2.4: a value that looks like a date to a human and is not one
 * to the machine reading it.
 */

/** No user, no grants, the token is the only authorisation this path has. */
const PREVIEW_CTX: RequestContext = {
  requestId: 'preview',
  ip: 'preview',
  userAgent: 'preview',
  user: null,
  roles: [],
  roleDetails: [],
  actions: [],
  pages: [],
  primaryRole: null,
  claims: null,
};

const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

/**
 * Mint a shareable, expiring link to ONE unpublished page.
 *
 * doc 13 §9.5: "signed draft token → Next.js draftMode() → renders unpublished
 * version. Shareable link with expiry so the Head can review on a phone."
 *
 * The raw token is returned once and never stored, only its SHA-256. This
 * table is a bearer credential store, and a plaintext token in a row readable
 * by staff is a working key to unpublished content for anyone who can see it.
 */
export async function createPreviewGrant(ctx: RequestContext, entityType: string, id: string) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MIN * 60_000);

  await asUser(ctx, async (tx) => {
    // Proves the caller can see the entity before granting a right to it.
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM pages WHERE id = ${id}
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.');
    }
    await tx.execute(sql`
      INSERT INTO preview_grants (token_hash, entity_type, entity_id, expires_at, created_by_id)
      VALUES (${hashToken(raw)}, ${entityType}, ${id},
              ${expiresAt.toISOString()}::timestamptz, ${ctx.user?.id ?? null})
    `);
  });

  await writeAuditLog({
    ctx,
    action: 'content.preview',
    entity: entityType,
    entityId: id,
    after: { expiresAt: expiresAt.toISOString() },
  });

  return { token: raw, expiresAt: expiresAt.toISOString() };
}

/**
 * Redeem a preview token for one unpublished page.
 *
 * Reads the page with ELEVATED rights on purpose, the whole point is to show
 * something `anon` may not see, but only after the token has been matched by
 * hash and found unexpired, and only for the single entity it names. That is
 * the narrowest form this can take: the token is the authorisation, the
 * `entity_id` is the scope, and `expires_at` is the bound.
 */
export async function redeemPreview(token: string) {
  return withElevatedPrivileges(
    PREVIEW_CTX,
    'preview.redeem',
    'render an unpublished page for a signed preview link',
    async (tx) => {
      const rows = await tx.execute<{ entity_id: string }>(sql`
        SELECT entity_id FROM preview_grants
        WHERE token_hash = ${hashToken(token)}
          AND entity_type = 'page'
          AND expires_at > now()
      `);
      const grant = (Array.from(rows) as { entity_id: string }[]).at(0);
      if (!grant) throw new ApiError(404, 'PREVIEW_EXPIRED', 'Tautan pratinjau tidak berlaku.');

      return readPageWithBlocks(tx, sql`p.id = ${grant.entity_id}`, true);
    },
  );
}

/**
 * The public shape of a page, with its visible blocks.
 *
 * `includeHidden` is true only for preview: an editor reviewing a draft needs
 * to see a block whose seasonal window has not opened, or they cannot tell a
 * scheduled banner from a missing one.
 */
async function readPageWithBlocks(tx: Tx, where: ReturnType<typeof sql>, includeHidden: boolean) {
  const rows = await tx.execute(sql`
    SELECT p.id, p.slug, p.title, p.description, p.locale,
           p.status::text AS status,
           p.published_at AS "publishedAt", p.updated_at AS "updatedAt",
           s.title AS "seoTitle", s.description AS "seoDescription",
           s.canonical AS "seoCanonical", s.og_image_key AS "seoOgImageKey",
           s.noindex AS "seoNoindex", s.json_ld AS "seoJsonLd"
    FROM pages p
    LEFT JOIN seo_meta s ON s.entity_type = 'page' AND s.entity_id = p.id
    WHERE ${where}
  `);
  const page = (Array.from(rows) as Record<string, unknown>[]).at(0);
  if (!page) throw new ApiError(404, 'NOT_FOUND', 'Halaman tidak ditemukan.');

  const visibility = includeHidden
    ? sql``
    : sql`AND b.visible
          AND (b.visible_from IS NULL OR b.visible_from <= now())
          AND (b.visible_until IS NULL OR b.visible_until > now())`;

  const blocks = await tx.execute(sql`
    SELECT b.id, b.type, b.props, b.order_index AS "orderIndex",
           b.visible, b.visible_from AS "visibleFrom", b.visible_until AS "visibleUntil"
    FROM page_blocks b
    WHERE b.page_id = ${page.id as string} ${visibility}
    ORDER BY b.order_index, b.id
  `);

  /**
   * Resolve every `mediaId` in a block's props to a URL beside it.
   *
   * Done here, once, rather than in each block component: the renderer must not
   * have to know how a storage key becomes a URL, and a component that fetched
   * its own image would turn a page of eight blocks into eight round trips.
   * The id stays in the props. It is what `media_usage` is keyed on, and
   * `mediaUrl`/`mediaAlt` are added next to it.
   */
  const assetRows = await tx.execute<{ id: string; storage_key: string; alt: string | null }>(sql`
    SELECT id, storage_key, alt FROM media_assets
  `);
  const assets = new Map(
    (Array.from(assetRows) as { id: string; storage_key: string; alt: string | null }[]).map(
      (a) => [a.id, { url: publicUrl(a.storage_key), alt: a.alt }],
    ),
  );

  const withMedia = (value: unknown, depth = 0): unknown => {
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => withMedia(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = typeof v === 'object' ? withMedia(v, depth + 1) : v;
    }
    if (typeof out.mediaId === 'string' && assets.has(out.mediaId)) {
      const asset = assets.get(out.mediaId)!;
      out.mediaUrl = asset.url;
      out.mediaAlt = asset.alt;
    }
    return out;
  };

  const iso = (v: unknown) =>
    typeof v === 'string' || v instanceof Date ? new Date(v).toISOString() : v;

  return {
    ...page,
    publishedAt: iso(page.publishedAt),
    updatedAt: iso(page.updatedAt),
    seoOgImageUrl: page.seoOgImageKey ? publicUrl(String(page.seoOgImageKey)) : null,
    blocks: (Array.from(blocks) as Record<string, unknown>[]).map((b) => ({
      ...b,
      props: withMedia(b.props),
    })),
  };
}

/** One published page by slug, for the public site. */
export async function getPublicPage(slug: string) {
  return asAnon((tx) => readPageWithBlocks(tx, sql`p.slug = ${slug}`, false));
}
