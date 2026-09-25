import { sql, type SQL } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import { hasAction } from '@/lib/auth/actions';
import { revalidate } from '@/lib/content/revalidate';
import { textArray } from '@/lib/db/sql-values';
import { publicUrl } from '../media/media.service';
import type { RequestContext } from '@/lib/auth/context';
import {
  allTypes,
  identifier,
  publishTags,
  resolveType,
  type ContentType,
} from './content.registry';
import type { ConsentInput } from './content.schema';
import {
  TRANSITIONS,
  type ContentAction,
  type ContentRow,
  type ContentStatus,
  type ListContentQueryInput,
  type RestoreInput,
  type SeoInput,
  type TransitionInput,
} from './content.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The editorial pipeline (doc 13 §9.2, doc 14 §2.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Type-agnostic by construction: nothing below names a programme, an article
 * or a page. Everything type-specific comes from `content.registry.ts`, so a
 * new content type is one registry entry and never a change here. If that ever
 * stops being true, the second pipeline has started.
 *
 * Three properties this file exists to guarantee:
 *
 *   ATOMIC     status change, version snapshot, slug redirect and audit either
 *              all happen or none do. Everything runs in ONE `asUser`
 *              transaction, so RLS gates it as well as the action guard.
 *   SERIALISED the row is locked `FOR UPDATE` before its status is read, so two
 *              simultaneous publishes cannot both see APPROVED.
 *   RECOVERABLE every publish writes an immutable snapshot, so "restore this
 *              version" is a click rather than a database restore.
 */

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

function typeOrThrow(key: string): ContentType {
  const type = resolveType(key);
  if (!type) throw new ApiError(404, 'UNKNOWN_CONTENT_TYPE', `Tipe konten "${key}" tidak dikenal.`);
  return type;
}

/**
 * Lock the row and read what the state machine needs.
 *
 * `FOR UPDATE` is the whole concurrency story. Without it, two publish requests
 * arriving together both read APPROVED, both pass the precondition, and both
 * write a version, producing two snapshots at the same version number (the
 * UNIQUE catches that, as a 500) or a double revalidation and a duplicated
 * audit trail. With it, the second waits and then correctly fails the
 * precondition with a 409.
 */
async function lockRow(tx: Tx, type: ContentType, id: string) {
  const rows = await tx.execute<{
    id: string;
    status: ContentStatus;
    version: number;
    slug: string | null;
  }>(sql`
    SELECT id, status, version
         ${type.slugColumn ? sql`, ${identifier(type.slugColumn)} AS slug` : sql`, NULL AS slug`}
    FROM ${identifier(type.table)}
    WHERE id = ${id}
    FOR UPDATE
  `);
  return (
    (
      Array.from(rows) as {
        id: string;
        status: ContentStatus;
        version: number;
        slug: string | null;
      }[]
    ).at(0) ?? null
  );
}

/** Everything the snapshot captures, as one jsonb object. */
async function snapshotOf(tx: Tx, type: ContentType, id: string) {
  const cols = type.snapshotColumns.map((c) => sql`${sql.raw(`'${c}'`)}, ${identifier(c)}`);
  const rows = await tx.execute<{ snapshot: Record<string, unknown> }>(sql`
    SELECT jsonb_build_object(${sql.join(cols, sql`, `)}) AS snapshot
    FROM ${identifier(type.table)} WHERE id = ${id}
  `);
  return (Array.from(rows) as { snapshot: Record<string, unknown> }[]).at(0)?.snapshot ?? {};
}

export async function listContent(
  ctx: RequestContext,
  query: ListContentQueryInput,
): Promise<{ items: ContentRow[] }> {
  const types = query.type ? [typeOrThrow(query.type)] : allTypes();

  const parts = types.map(
    (t) => sql`
      SELECT c.id,
             ${sql.raw(`'${t.key}'`)}    AS type,
             c.${identifier(t.titleColumn)} AS title,
             ${t.slugColumn ? sql`c.${identifier(t.slugColumn)}` : sql`NULL`} AS slug,
             c.status::text               AS status,
             c.version,
             c.publish_at                 AS "publishAt",
             c.published_at               AS "publishedAt",
             c.review_note                AS "reviewNote",
             u.full_name                  AS "reviewedByName",
             c.reviewed_at                AS "reviewedAt",
             c.${identifier(t.updatedAtColumn ?? 'created_at')} AS "updatedAt"
      FROM ${identifier(t.table)} c
      LEFT JOIN users u ON u.id = c.reviewed_by_id
      ${query.status ? sql`WHERE c.status = ${query.status}::content_status` : sql``}
    `,
  );

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<ContentRow & Record<string, unknown>>(sql`
      SELECT * FROM (${sql.join(parts, sql` UNION ALL `)}) q
      ORDER BY q."publishAt" NULLS LAST, q.title
      LIMIT ${query.limit}
    `);
    return { items: Array.from(rows) as ContentRow[] };
  });
}

export async function getVersions(ctx: RequestContext, typeKey: string, id: string) {
  const type = typeOrThrow(typeKey);
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT v.version, v.note, v.created_at AS "createdAt", u.full_name AS "authorName"
      FROM content_versions v
      LEFT JOIN users u ON u.id = v.author_id
      WHERE v.entity_type = ${type.key} AND v.entity_id = ${id}
      ORDER BY v.version DESC
    `);
    return { items: Array.from(rows) };
  });
}

/**
 * Move a piece of content through the pipeline.
 *
 * One function for every transition because they differ only in the table
 * above: which statuses are legal to leave, which status to land on, and which
 * verb is required. Writing seven near-identical functions is how the seventh
 * one forgets to lock the row.
 */
export async function transition(
  ctx: RequestContext,
  typeKey: string,
  id: string,
  action: Exclude<ContentAction, 'restore'>,
  input: TransitionInput,
) {
  const type = typeOrThrow(typeKey);
  const rule = TRANSITIONS[action];

  if (rule.action && !hasAction(ctx, rule.action)) {
    throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang melakukan tindakan ini.');
  }
  if (rule.requiresNote && !input.note?.trim()) {
    throw new ApiError(
      422,
      'NOTE_REQUIRED',
      'Tulis alasannya supaya penulis tahu apa yang harus diubah.',
    );
  }
  if (action === 'schedule') {
    if (!input.publishAt) {
      throw new ApiError(422, 'PUBLISH_AT_REQUIRED', 'Tentukan kapan konten ini terbit.');
    }
    if (input.publishAt.getTime() <= Date.now()) {
      /**
       * A schedule in the past never fires, the cron only looks forward from
       * `publish_at <= now()`, so it would publish on the very next tick and
       * the editor would think scheduling is broken. Refusing is clearer.
       */
      throw new ApiError(422, 'PUBLISH_AT_IN_PAST', 'Jadwal terbit harus di masa depan.');
    }
  }

  const result = await asUser(ctx, async (tx) => {
    const row = await lockRow(tx, type, id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Konten tidak ditemukan.');

    if (!rule.from.includes(row.status)) {
      throw new ApiError(
        409,
        'ILLEGAL_TRANSITION',
        `Konten berstatus ${row.status} tidak bisa "${action}".`,
      );
    }

    /**
     * Content-specific preconditions, before anything is written.
     *
     * The state machine above decides whether the MOVE is legal; this decides
     * whether the CONTENT is ready to make it. Keeping them apart is what lets
     * the pipeline stay type-agnostic while still refusing to publish a
     * testimonial nobody has consent for.
     */
    if (type.beforeTransition) await type.beforeTransition(tx, id, action, rule.to);

    const publishing = rule.to === 'PUBLISHED';
    const nextVersion = publishing ? row.version + 1 : row.version;

    /**
     * The snapshot is taken BEFORE the status write, from the row as it stands,
     * that is the content being published, which is what a restore has to
     * bring back.
     */
    if (publishing) {
      const snapshot = await snapshotOf(tx, type, id);
      await tx.execute(sql`
        INSERT INTO content_versions (entity_type, entity_id, version, snapshot, author_id, note)
        VALUES (${type.key}, ${id}, ${nextVersion}, ${JSON.stringify(snapshot)}::jsonb,
                ${ctx.user!.id}, ${input.note ?? null})
      `);
    }

    const updated = await tx.execute<{ id: string; slug: string | null }>(sql`
      UPDATE ${identifier(type.table)}
      SET status         = ${rule.to}::content_status,
          version        = ${nextVersion},
          publish_at     = ${action === 'schedule' ? sql`${input.publishAt!.toISOString()}::timestamptz` : sql`NULL`},
          published_at   = ${publishing ? sql`now()` : sql`published_at`},
          review_note    = ${input.note ?? null},
          reviewed_by_id = ${ctx.user!.id},
          reviewed_at    = now()
      WHERE id = ${id}
      RETURNING id ${type.slugColumn ? sql`, ${identifier(type.slugColumn)} AS slug` : sql`, NULL AS slug`}
    `);
    if (Array.from(updated).length === 0) {
      // RLS matched no row: the action guard passed but the policy disagreed.
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah konten ini.');
    }

    return { previousStatus: row.status, slug: row.slug, version: nextVersion };
  });

  await writeAuditLog({
    ctx,
    action: `content.${action}`,
    entity: type.key,
    entityId: id,
    before: { status: result.previousStatus },
    after: { status: rule.to, version: result.version },
    meta: { note: input.note ?? null, publishAt: input.publishAt ?? null },
  });

  /**
   * Revalidation happens AFTER the transaction commits, and its failure never
   * fails the request. The publish is durable in Postgres; a stale page for a
   * few minutes is a smaller problem than an editor being told their publish
   * failed when it did not, and re-publishing to "fix" it.
   */
  if (rule.to === 'PUBLISHED' || result.previousStatus === 'PUBLISHED') {
    await revalidate(publishTags(type, { slug: result.slug }), ctx.requestId);
  }

  return { id, status: rule.to, version: result.version };
}

/**
 * Restore a previous version.
 *
 * Restoring writes the old content back into the row and leaves it as a DRAFT,
 * deliberately NOT republished. Bringing back an old version is an editorial
 * decision; pushing it live is a second one, and collapsing them means a
 * misclick changes the public site.
 */
export async function restoreVersion(
  ctx: RequestContext,
  typeKey: string,
  id: string,
  input: RestoreInput,
) {
  const type = typeOrThrow(typeKey);
  if (!hasAction(ctx, 'content.publish')) {
    throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang memulihkan versi.');
  }

  const result = await asUser(ctx, async (tx) => {
    const row = await lockRow(tx, type, id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Konten tidak ditemukan.');

    const found = await tx.execute<{ snapshot: Record<string, unknown> }>(sql`
      SELECT snapshot FROM content_versions
      WHERE entity_type = ${type.key} AND entity_id = ${id} AND version = ${input.version}
    `);
    const snapshot = (Array.from(found) as { snapshot: Record<string, unknown> }[]).at(0)?.snapshot;
    if (!snapshot) throw new ApiError(404, 'VERSION_NOT_FOUND', 'Versi itu tidak ada.');

    /**
     * `jsonb_populate_record` does the casting, not us.
     *
     * The obvious approach, `SET col = snapshot ->> 'col'`, yields text for
     * every column, which silently breaks the moment a type is not text:
     * `price_monthly` is an integer and `levels` is `text[]`. Populating a
     * record of the table's own row type makes Postgres apply each column's
     * real type, so a restore round-trips arrays and money correctly.
     *
     * Only the registry's allowlisted columns are copied across; `id`,
     * `status`, `version` and the timestamps stay under this service's control.
     */
    const sets = type.snapshotColumns.map((c) => sql`${identifier(c)} = snap.${identifier(c)}`);

    await tx.execute(sql`
      UPDATE ${identifier(type.table)} AS target
      SET ${sql.join(sets, sql`, `)},
          status  = 'DRAFT'::content_status,
          version = ${row.version + 1}
      FROM jsonb_populate_record(
             NULL::${identifier(type.table)},
             ${JSON.stringify(snapshot)}::jsonb
           ) AS snap
      WHERE target.id = ${id}
    `);

    await tx.execute(sql`
      INSERT INTO content_versions (entity_type, entity_id, version, snapshot, author_id, note)
      VALUES (${type.key}, ${id}, ${row.version + 1}, ${JSON.stringify(snapshot)}::jsonb,
              ${ctx.user!.id}, ${input.note ?? `Dipulihkan dari versi ${input.version}`})
    `);

    return { previousStatus: row.status, previousSlug: row.slug, version: row.version + 1 };
  });

  await writeAuditLog({
    ctx,
    action: 'content.restore',
    entity: type.key,
    entityId: id,
    before: { status: result.previousStatus },
    after: { restoredFrom: input.version, status: 'DRAFT', version: result.version },
    meta: { note: input.note ?? null },
  });

  // The live page just changed (it is no longer published), so purge it.
  if (result.previousStatus === 'PUBLISHED') {
    await revalidate(publishTags(type, { slug: result.previousSlug }), ctx.requestId);
  }

  return { id, status: 'DRAFT' as const, version: result.version };
}

/**
 * Edit a draft's own fields.
 *
 * Only DRAFT is editable. Editing something already in review, approved or
 * live would silently change what the reviewer approved, or what the public is
 * reading, without going back through the pipeline, which is the pipeline's
 * entire purpose.
 *
 * A slug change on content that has EVER been published writes a 301, because
 * the old URL is out in the world (doc 13 §10.8).
 */
export async function updateDraft(
  ctx: RequestContext,
  typeKey: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const type = typeOrThrow(typeKey);

  const COLUMN = type.editableColumns;

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) throw new ApiError(422, 'NO_CHANGES', 'Tidak ada perubahan.');

  /**
   * Renaming a URL that has been live is a PUBLISHING decision, not an
   * authoring one.
   *
   * It writes a 301 that changes how the public web reaches the site, and
   * `redirects_write` requires `content.publish`, so an author attempting it
   * used to get an opaque 500 from RLS deep inside the transaction. Checking
   * here turns that into a sentence explaining who can do it.
   *
   * Editing every other field of a draft stays open to any author.
   */
  const wantsSlugChange = typeof patch.slug === 'string';
  if (wantsSlugChange && !hasAction(ctx, 'content.publish')) {
    const everPublished = await asUser(ctx, async (tx) => {
      const rows = await tx.execute<{ version: number }>(sql`
        SELECT version FROM ${identifier(type.table)} WHERE id = ${id}
      `);
      return ((Array.from(rows) as { version: number }[]).at(0)?.version ?? 0) > 0;
    });
    if (everPublished) {
      throw new ApiError(
        403,
        'SLUG_CHANGE_NEEDS_PUBLISHER',
        'Mengubah alamat konten yang pernah terbit butuh izin menerbitkan, alamat lama harus dialihkan.',
      );
    }
  }

  const result = await asUser(ctx, async (tx) => {
    const row = await lockRow(tx, type, id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Konten tidak ditemukan.');
    if (row.status !== 'DRAFT') {
      throw new ApiError(
        409,
        'NOT_EDITABLE',
        `Hanya draf yang bisa diubah. Status sekarang ${row.status}.`,
      );
    }

    /**
     * Derived state is computed here, not accepted from the caller.
     *
     * The hook also writes the rows that must not drift from this edit,
     * an article's tags and its `media_usage`, inside this transaction, so a
     * failed UPDATE cannot leave a usage row claiming an image is in use.
     *
     * It runs BEFORE the UPDATE so anything it returns lands in the same
     * statement: two writes to one row would double the audit trail and let a
     * reader observe the article half-updated.
     */
    const derived = type.onDraftUpdate ? await type.onDraftUpdate(tx, ctx, id, patch) : {};

    /**
     * Keyed by COLUMN, not by field, and derived is applied last.
     *
     * Both halves can target the same column, an article's `body` arrives in
     * the patch and comes back from the hook already serialised and cast. A
     * plain list produced `SET body = $1, body = $3::jsonb`, which Postgres
     * rejects outright ("multiple assignments to same column"). Deriving last
     * also states the rule the right way round: computed state wins over
     * anything the client sent for the same column.
     */
    const assignments = new Map<string, SQL>();
    for (const [field, value] of entries) {
      const col = COLUMN[field];
      if (!col) {
        // No column, but a hook exists: a virtual field (tags) it already
        // applied. No column and no hook: a typo, and silence would lose data.
        if (type.onDraftUpdate) continue;
        throw new ApiError(422, 'UNKNOWN_FIELD', `Field "${field}" tidak dikenal.`);
      }
      /**
       * An array column has to be bound as one parameter.
       *
       * Passed straight through, drizzle expands a JS array into separate
       * placeholders and the statement becomes `SET levels = ($1, $2)`, a row
       * expression Postgres rejects. A one-element array is worse: `($1)` is
       * valid SQL meaning a plain scalar, so it would have stored the wrong
       * thing without erroring. Handled here rather than in each type's hook,
       * because "this column holds a list" is a fact about the column.
       */
      /**
       * A `Date` must cross this boundary as an ISO string.
       *
       * Interpolated directly, the driver renders it with `toString()`,
       * `Sun May 12 2026 00:00:00 GMT+0800 (Central Indonesia Time)`, and
       * Postgres rejects the trailing timezone NAME, so any draft patch
       * carrying a date field was a 500. §2.6 hit this in one hand-written
       * INSERT and fixed it there; it was in the SHARED builder all along,
       * unnoticed because no registered type had a date column until the
       * testimonial consent record arrived.
       *
       * Zod's `z.coerce.date()` is what produces the Date, so any type using it
       * would have found the same wall.
       */
      const bound =
        value instanceof Date
          ? sql`${value.toISOString()}::timestamptz`
          : (value as SQL | string | number | null);

      assignments.set(
        col,
        Array.isArray(value)
          ? sql`${identifier(col)} = ${textArray(value as string[])}`
          : sql`${identifier(col)} = ${bound}`,
      );
    }
    // Derived keys are physical column names, and may be SQL fragments so a
    // hook can cast (jsonb) rather than rely on the driver guessing.
    for (const [col, value] of Object.entries(derived)) {
      assignments.set(col, sql`${identifier(col)} = ${value as SQL | string | number | null}`);
    }
    const sets = [...assignments.values()];

    /**
     * The edit timestamp moves on every save, including one that touched only
     * virtual fields (adding a tag), which would otherwise leave the row
     * looking untouched and produce an empty SET list.
     *
     * Registry-declared rather than assumed: `programs` has only `created_at`,
     * and hardcoding `updated_at = now()` made every programme edit a 500.
     */
    if (type.updatedAtColumn) sets.push(sql`${identifier(type.updatedAtColumn)} = now()`);
    if (sets.length === 0) throw new ApiError(422, 'NO_CHANGES', 'Tidak ada perubahan.');

    const updated = await tx.execute<{ id: string }>(sql`
      UPDATE ${identifier(type.table)} SET ${sql.join(sets, sql`, `)}
      WHERE id = ${id} RETURNING id
    `);
    if (Array.from(updated).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah konten ini.');
    }

    /**
     * The redirect is written here, inside the same transaction, so a renamed
     * slug and its 301 can never disagree.
     *
     * Only when the content has been published before (`version > 0`): a draft
     * that has never been live has no URL anybody could have linked to, and
     * writing redirects for it would fill the table with noise that has to be
     * evaluated on every 404.
     */
    const newSlug = patch.slug as string | undefined;
    if (type.publicPath && newSlug && row.slug && newSlug !== row.slug && row.version > 0) {
      await tx.execute(sql`
        INSERT INTO redirects (from_path, to_path, status_code, reason)
        VALUES (${type.publicPath(row.slug)}, ${type.publicPath(newSlug)}, 301,
                ${`Slug ${type.key} diubah`})
        ON CONFLICT (from_path) DO UPDATE SET to_path = EXCLUDED.to_path
      `);
      return { redirected: { from: row.slug, to: newSlug } };
    }
    return { redirected: null };
  });

  await writeAuditLog({
    ctx,
    action: 'content.update',
    entity: type.key,
    entityId: id,
    after: patch,
    meta: result.redirected ? { redirect: result.redirected } : undefined,
  });

  return { id, ...result };
}

/** Per-entity SEO overrides. Upsert, because the panel is edit-in-place. */
export async function saveSeo(ctx: RequestContext, typeKey: string, id: string, input: SeoInput) {
  const type = typeOrThrow(typeKey);

  const slug = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO seo_meta (entity_type, entity_id, title, description, canonical, og_image_key, noindex, updated_at)
      VALUES (${type.key}, ${id}, ${input.title ?? null}, ${input.description ?? null},
              ${input.canonical ?? null}, ${input.ogImageKey ?? null}, ${input.noindex ?? false}, now())
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description,
        canonical = EXCLUDED.canonical, og_image_key = EXCLUDED.og_image_key,
        noindex = EXCLUDED.noindex, updated_at = now()
      RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah SEO.');
    }

    if (!type.slugColumn) return null;
    const owner = await tx.execute<{ slug: string }>(sql`
      SELECT ${identifier(type.slugColumn)} AS slug FROM ${identifier(type.table)} WHERE id = ${id}
    `);
    return Array.from(owner).at(0)?.slug ?? null;
  });

  await writeAuditLog({ ctx, action: 'content.seo', entity: type.key, entityId: id, after: input });

  /**
   * SEO edits purge the same tags a publish does.
   *
   * Found by using the panel: an editor rewrote a meta description, the API
   * saved it, and the live page kept serving the old one for the full
   * five-minute window with nothing to indicate why. Every public page has read
   * `seo_meta` since §2.4 through a tag-cached fetch, so writing that table
   * without purging was always going to be stale, and until §2.8 nothing could
   * write it except SQL, which is why nobody had met it.
   *
   * `noindex` makes it worse than cosmetic: it changes what `sitemap.xml`
   * publishes, so the URL would keep being handed to crawlers after being
   * marked hidden. Best effort, after commit, exactly like a publish.
   */
  await revalidate(publishTags(type, { slug }), ctx.requestId);
  return { ok: true };
}

/**
 * The SEO overrides for one row, and where that row will live on the site.
 *
 * Always an object, never null. "No `seo_meta` row yet" and "a row with every
 * field blank" are the same thing to an editor, and returning null for the
 * first made the panel unable to tell the difference between "nothing set" and
 * "not loaded". Every field can still be null on its own. That is what "derive
 * it from the content" looks like in the database.
 *
 * `publicPath` comes from the registry rather than being assembled by the
 * editor, which would be a second place that knows an article lives under
 * `/articles/`, §2.4 already fixed that string once, in the one place it
 * belongs.
 */
export async function getSeo(ctx: RequestContext, typeKey: string, id: string) {
  const type = typeOrThrow(typeKey);

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ slug: string | null }>(sql`
      SELECT ${type.slugColumn ? identifier(type.slugColumn) : sql`NULL`} AS slug
      FROM ${identifier(type.table)} WHERE id = ${id}
    `);
    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', `${type.label} tidak ditemukan.`);

    const seo = await tx.execute(sql`
      SELECT title, description, canonical, og_image_key AS "ogImageKey", noindex
      FROM seo_meta WHERE entity_type = ${type.key} AND entity_id = ${id}
    `);
    const overrides = (Array.from(seo) as Record<string, unknown>[]).at(0);
    const merged = {
      title: null,
      description: null,
      canonical: null,
      ogImageKey: null,
      noindex: false,
      ...overrides,
    };

    return {
      ...merged,
      /**
       * Resolved here, so the editor never has to know the bucket layout. The
       * key alone would make the panel build a storage URL, a third place that
       * knows where media lives, and the one that breaks silently when it moves.
       */
      ogImageUrl: merged.ogImageKey ? publicUrl(String(merged.ogImageKey)) : null,
      publicPath: type.publicPath && row.slug ? type.publicPath(row.slug) : null,
    };
  });
}

/**
 * Record who agreed to a child's name being published, and when (§3.7).
 *
 * A separate endpoint rather than a draft field, and gated by `content.publish`
 * rather than by the `/site` page grant, because it answers the reviewer's
 * question and not the author's: whoever is about to put a minor's name on the
 * open web is the person who should be asserting that the family said yes.
 *
 * Editable at ANY status, unlike draft content. The gate fires at PUBLISH, and
 * an APPROVED article is no longer a draft, without this the only way to add a
 * consent note would be to reject the article back to DRAFT and take it through
 * review a second time, which is process punishing somebody for doing the check.
 *
 * Only types that actually carry the columns accept it. `articles` and
 * `testimonials` do; asking for consent on a programme is a programming error
 * and says so.
 */
export async function saveConsent(
  ctx: RequestContext,
  typeKey: string,
  id: string,
  input: ConsentInput,
) {
  const type = typeOrThrow(typeKey);
  if (!('consentSource' in type.editableColumns)) {
    throw new ApiError(
      422,
      'CONSENT_NOT_APPLICABLE',
      `Tipe "${type.key}" tidak menyimpan catatan izin.`,
    );
  }

  const saved = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE ${identifier(type.table)}
      SET consent_source = ${input.source},
          consent_at = ${
            input.source === null
              ? sql`NULL`
              : sql`COALESCE(${input.at ? input.at.toISOString() : null}::timestamptz, now())`
          }
      WHERE id = ${id}
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Konten tidak ditemukan.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.consent',
    entity: type.key,
    entityId: saved.id,
    after: { consentSource: input.source },
  });

  return { id: saved.id, consentSource: input.source };
}
