import { sql } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import { publicUrl } from '../media/media.service';
import type {
  ArticleListQueryInput,
  CategoryInput,
  CreateArticleInput,
  TagInput,
} from './articles.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Articles: creation, taxonomy and reading (doc 13 §10, doc 14 §2.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What is NOT here, on purpose: submit, approve, schedule, publish, unpublish,
 * archive, version history, restore, the 301 on a slug change, and the draft
 * editor's own PATCH. All of that is `modules/content`, an article is a
 * registered content type, so it inherits the pipeline rather than repeating
 * it. This file only covers what a programme does not have: a body made of
 * nodes, a taxonomy, and a search.
 */

/**
 * Slugs are derived, then made unique, never trusted from the browser.
 *
 * Two editors filing "Juara 1 OSN Matematika" on the same day is normal, not
 * exceptional, so a collision must produce a working second article rather than
 * a 409 the author cannot act on. The suffix is a counter, not a random string:
 * `-2` is guessable and readable, a nanoid in a URL is neither.
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
  return base || 'artikel';
}

async function uniqueSlug(
  tx: Parameters<Parameters<typeof asUser>[1]>[0],
  base: string,
  locale: string,
): Promise<string> {
  /**
   * One round trip, not a loop of SELECTs: reading the taken suffixes and
   * picking the next is atomic enough under the UNIQUE constraint, and a loop
   * would issue a query per collision on exactly the titles that collide most.
   */
  const rows = await tx.execute<{ slug: string }>(sql`
    SELECT slug FROM articles
    WHERE locale = ${locale} AND (slug = ${base} OR slug LIKE ${base + '-%'})
  `);
  const taken = new Set((Array.from(rows) as { slug: string }[]).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ApiError(409, 'SLUG_EXHAUSTED', 'Terlalu banyak artikel dengan judul yang sama.');
}

/**
 * Resolve the cover's public URL from the joined storage key.
 *
 * Done here rather than in the browser so the URL shape lives in exactly one
 * place, the media module, and a bucket rename is one edit, not a hunt
 * through every consumer that happened to string-concatenate it.
 */
function withCoverUrl(rows: Record<string, unknown>[]) {
  return rows.map((r) => ({
    ...r,
    coverUrl: r.coverKey ? publicUrl(String(r.coverKey)) : null,
  }));
}

export async function createArticle(ctx: RequestContext, input: CreateArticleInput) {
  const locale = input.locale ?? 'id';

  const created = await asUser(ctx, async (tx) => {
    const slug = await uniqueSlug(
      tx,
      input.slug ? slugify(input.slug) : slugify(input.title),
      locale,
    );

    /**
     * The author defaults to whoever is writing.
     *
     * doc 13 §10.5 wants a real byline for E-E-A-T, and the reliable moment to
     * capture it is now, asking later produces articles credited to whoever
     * happened to publish them.
     */
    const rows = await tx.execute<{ id: string; slug: string }>(sql`
      INSERT INTO articles (title, slug, locale, category_id, author_id)
      VALUES (
        ${input.title}, ${slug}, ${locale},
        ${input.categoryId ?? null}::uuid,
        ${input.authorId ?? ctx.user?.id ?? null}::uuid
      )
      RETURNING id, slug
    `);
    const row = (Array.from(rows) as { id: string; slug: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat artikel.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'article',
    entityId: created.id,
    after: { title: input.title, slug: created.slug, status: 'DRAFT' },
  });

  return { id: created.id, slug: created.slug, status: 'DRAFT' as const };
}

/**
 * The editorial article list.
 *
 * Distinct from `listContent`, which spans every content type and therefore can
 * only show the columns all types share. This one filters by category, tag and
 * author, and searches, the things an editor with 300 articles actually needs.
 */
export async function listArticles(ctx: RequestContext, query: ArticleListQueryInput) {
  const where = [sql`TRUE`];
  if (query.status) where.push(sql`a.status = ${query.status}::content_status`);
  if (query.categoryId) where.push(sql`a.category_id = ${query.categoryId}::uuid`);
  if (query.authorId) where.push(sql`a.author_id = ${query.authorId}::uuid`);
  if (query.featured !== undefined) where.push(sql`a.featured = ${query.featured}`);
  if (query.tagId) {
    where.push(sql`EXISTS (
      SELECT 1 FROM article_tags t WHERE t.article_id = a.id AND t.tag_id = ${query.tagId}::uuid
    )`);
  }
  if (query.q) {
    /**
     * `plainto_tsquery` over the same expression the index was built on, so the
     * GIN index is actually used. `simple` rather than `indonesian`: Postgres
     * ships no Indonesian stemmer, and `english` would stem Indonesian words
     * into nonsense, "menang" and "kemenangan" simply stay distinct.
     */
    where.push(sql`
      to_tsvector('simple',
        coalesce(a.title,'') || ' ' || coalesce(a.subtitle,'') || ' ' || coalesce(a.excerpt,''))
      @@ plainto_tsquery('simple', ${query.q})
    `);
  }

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT a.id, a.title, a.slug, a.locale, a.status::text AS status, a.version,
             a.excerpt, a.featured, a.pinned_rank AS "pinnedRank",
             a.reading_min AS "readingMin", a.view_count AS "viewCount",
             a.publish_at AS "publishAt", a.published_at AS "publishedAt",
             a.updated_at AS "updatedAt",
             a.category_id AS "categoryId", c.name AS "categoryName",
             a.author_id AS "authorId", u.full_name AS "authorName",
             a.cover_id AS "coverId", m.storage_key AS "coverKey", m.alt AS "coverAlt",
             -- §3.7: non-null marks a draft the win created rather than a person.
             a.competition_target_id AS "competitionTargetId",
             a.student_id AS "studentId",
             a.consent_source AS "consentSource",
             COALESCE(
               (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
                                ORDER BY t.name)
                FROM article_tags at JOIN tags t ON t.id = at.tag_id
                WHERE at.article_id = a.id),
               '[]'::json
             ) AS tags
      FROM articles a
      LEFT JOIN article_categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN media_assets m ON m.id = a.cover_id
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY a.pinned_rank NULLS LAST, COALESCE(a.published_at, a.updated_at) DESC
      LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    const total = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM articles a WHERE ${sql.join(where, sql` AND `)}
    `);
    return {
      items: withCoverUrl(Array.from(rows) as Record<string, unknown>[]),
      total: (Array.from(total) as { n: number }[]).at(0)?.n ?? 0,
    };
  });
}

/**
 * One article, whole, including the body AST.
 *
 * This is also the internal preview: an editor previewing a draft reads the
 * same row through the same RLS policy that governs editing it. There is no
 * separate preview token, and so no second way to read unpublished content.
 *
 * Columns are listed rather than `SELECT a.*`: the star returns them in the
 * database's snake_case while every other endpoint in this system answers in
 * camelCase, so the editor silently read `undefined` for reading time, cover
 * and category, the fields render as blank, which looks like empty data.
 */
export async function getArticle(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT a.id, a.title, a.subtitle, a.slug, a.locale, a.excerpt, a.body,
             a.status::text AS status, a.version,
             a.featured, a.pinned_rank AS "pinnedRank", a.reading_min AS "readingMin",
             a.view_count AS "viewCount", a.review_note AS "reviewNote",
             a.publish_at AS "publishAt", a.published_at AS "publishedAt",
             a.created_at AS "createdAt", a.updated_at AS "updatedAt",
             a.category_id AS "categoryId", a.author_id AS "authorId",
             a.cover_id AS "coverId", a.student_id AS "studentId", a.program_id AS "programId",
             -- §3.7: the achievement link and the consent record the publish gate reads.
             a.competition_id AS "competitionId",
             a.competition_target_id AS "competitionTargetId",
             a.consent_source AS "consentSource", a.consent_at AS "consentAt",
             st.name AS "studentName", comp.name AS "competitionName",
             c.name AS "categoryName", c.slug AS "categorySlug",
             u.full_name AS "authorName",
             m.storage_key AS "coverKey", m.alt AS "coverAlt",
             COALESCE(
               (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
                                ORDER BY t.name)
                FROM article_tags at JOIN tags t ON t.id = at.tag_id
                WHERE at.article_id = a.id),
               '[]'::json
             ) AS tags
      FROM articles a
      LEFT JOIN article_categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN media_assets m ON m.id = a.cover_id
      LEFT JOIN students st ON st.id = a.student_id
      LEFT JOIN competitions comp ON comp.id = a.competition_id
      WHERE a.id = ${id}
    `);
    const row = (Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
    return withCoverUrl([row])[0];
  });
}

export async function deleteArticle(ctx: RequestContext, id: string) {
  const removed = await asUser(ctx, async (tx) => {
    /**
     * Only a draft is deletable, and only one that has never been published.
     *
     * A published article has a URL in the world, possibly in search results
     * and in a parent's messages. `version > 0` proves it was live at least
     * once; the answer for those is ARCHIVE, which the pipeline already does,
     * keeps the row, and lets 2.8 serve a 410 rather than a bare 404.
     */
    const rows = await tx.execute<{ status: string; version: number; title: string }>(sql`
      SELECT status::text AS status, version, title FROM articles WHERE id = ${id} FOR UPDATE
    `);
    const row = (Array.from(rows) as { status: string; version: number; title: string }[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
    if (row.status !== 'DRAFT' || row.version > 0) {
      throw new ApiError(
        409,
        'NOT_DELETABLE',
        'Hanya draf yang belum pernah terbit bisa dihapus. Gunakan arsip untuk artikel yang sudah tayang.',
      );
    }

    // `article_tags` cascades; `media_usage` does not, so release it explicitly
    // or the images stay undeletable forever, protected by a row nothing reads.
    await tx.execute(sql`
      DELETE FROM media_usage WHERE entity_type = 'article' AND entity_id = ${id}
    `);
    await tx.execute(sql`DELETE FROM articles WHERE id = ${id}`);
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.delete',
    entity: 'article',
    entityId: id,
    before: { title: removed.title, status: removed.status },
  });

  return { id, deleted: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Taxonomy
// ═══════════════════════════════════════════════════════════════════════════

export async function listCategories(ctx: RequestContext) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT c.id, c.slug, c.name, c.description, c.order_index AS "orderIndex",
             (SELECT count(*)::int FROM articles a WHERE a.category_id = c.id) AS "articleCount"
      FROM article_categories c
      ORDER BY c.order_index, c.name
    `);
    return { items: Array.from(rows) };
  });
}

export async function saveCategory(ctx: RequestContext, input: CategoryInput, id?: string) {
  const slug = slugify(input.slug ?? input.name);

  const row = await asUser(ctx, async (tx) => {
    const rows = id
      ? await tx.execute<{ id: string }>(sql`
          UPDATE article_categories
          SET name = ${input.name}, slug = ${slug},
              description = ${input.description ?? null},
              order_index = ${input.orderIndex ?? 0}
          WHERE id = ${id} RETURNING id
        `)
      : await tx.execute<{ id: string }>(sql`
          INSERT INTO article_categories (name, slug, description, order_index)
          VALUES (${input.name}, ${slug}, ${input.description ?? null}, ${input.orderIndex ?? 0})
          RETURNING id
        `);
    const out = (Array.from(rows) as { id: string }[]).at(0);
    if (!out) throw new ApiError(id ? 404 : 403, 'NOT_SAVED', 'Kategori tidak tersimpan.');
    return out;
  });

  await writeAuditLog({
    ctx,
    action: 'settings.update',
    entity: 'article_category',
    entityId: row.id,
    after: { name: input.name, slug },
  });

  return { id: row.id, slug };
}

export async function deleteCategory(ctx: RequestContext, id: string) {
  await asUser(ctx, async (tx) => {
    /**
     * Refused while articles still point at it.
     *
     * The FK has no ON DELETE, so the database would refuse anyway, with a
     * constraint name. This turns it into a sentence that says how many
     * articles are in the way, which is the number the editor needs.
     */
    const used = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM articles WHERE category_id = ${id}
    `);
    const n = (Array.from(used) as { n: number }[]).at(0)?.n ?? 0;
    if (n > 0) {
      throw new ApiError(
        409,
        'CATEGORY_IN_USE',
        `Kategori masih dipakai ${n} artikel. Pindahkan artikelnya dulu.`,
      );
    }
    const rows = await tx.execute<{ id: string }>(sql`
      DELETE FROM article_categories WHERE id = ${id} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Kategori tidak ditemukan.');
    }
  });

  await writeAuditLog({ ctx, action: 'settings.update', entity: 'article_category', entityId: id });
  return { id, deleted: true };
}

export async function listTags(ctx: RequestContext) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT t.id, t.slug, t.name,
             (SELECT count(*)::int FROM article_tags at WHERE at.tag_id = t.id) AS "articleCount"
      FROM tags t ORDER BY t.name
    `);
    return { items: Array.from(rows) };
  });
}

/**
 * Create-or-return, not create.
 *
 * The editor types a tag name while writing; asking whether it already exists
 * is the API's job, not the author's. Returning the existing row on conflict is
 * what stops "OSN", "osn" and "OSN " becoming three tags, the slug is the
 * identity, the name is only how it is displayed.
 */
export async function upsertTag(ctx: RequestContext, input: TagInput) {
  const slug = slugify(input.slug ?? input.name);

  const row = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; name: string; created: boolean }>(sql`
      INSERT INTO tags (name, slug) VALUES (${input.name}, ${slug})
      ON CONFLICT (slug) DO UPDATE SET name = tags.name
      RETURNING id, name, (xmax = 0) AS created
    `);
    const out = (Array.from(rows) as { id: string; name: string; created: boolean }[]).at(0);
    if (!out) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat tag.');
    return out;
  });

  if (row.created) {
    await writeAuditLog({
      ctx,
      action: 'settings.update',
      entity: 'tag',
      entityId: row.id,
      after: { name: input.name, slug },
    });
  }

  return { id: row.id, slug, name: row.name, created: row.created };
}

export async function deleteTag(ctx: RequestContext, id: string) {
  await asUser(ctx, async (tx) => {
    // Unlike a category, removing a tag is safe: `article_tags` cascades and a
    // tag carries no navigation, so nothing breaks except the cluster page.
    const rows = await tx.execute<{ id: string }>(sql`
      DELETE FROM tags WHERE id = ${id} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Tag tidak ditemukan.');
    }
  });

  await writeAuditLog({ ctx, action: 'settings.update', entity: 'tag', entityId: id });
  return { id, deleted: true };
}
