import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import { env } from '@/lib/env';
import { asUser, withElevatedPrivileges } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { hasAction } from '@/lib/auth/actions';
import { ApiError } from '@/lib/http/errors';
import { logger } from '@/lib/logger';
import type { RequestContext } from '@/lib/auth/context';
import {
  MAX_BYTES,
  type ConfirmUploadInput,
  type DeleteMediaQueryInput,
  type ListMediaQueryInput,
  type MediaAsset,
  type RequestUploadInput,
  type UpdateMediaInput,
} from './media.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Media library (doc 13 §9.7, doc 14 §2.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Content-type agnostic on purpose. No function here takes an article, a page
 * or a programme, and `media_usage` records what points at an asset using the
 * same (entity_type, entity_id) shape the rest of the content layer uses. When
 * Phase 2.3 attaches a cover image, nothing in this module changes.
 *
 * The bucket is PUBLIC: these images are served to the open web from inside
 * ISR-cached HTML, and a signed URL that expires cannot live in a cached page.
 * That decision is why `ALLOWED_MIME` excludes SVG, see media.schema.ts.
 */
const MEDIA_BUCKET = 'media';

const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Row = MediaAsset & Record<string, unknown>;

/**
 * The public URL Supabase serves an object at. Stable for the object's life.
 *
 * Exported so consumers that join to `media_assets` themselves, articles
 * resolving a cover, produce the same URL rather than re-deriving the shape.
 */
export function publicUrl(key: string): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${key}`;
}

const SELECT_MEDIA = sql`
  SELECT m.id,
         m.storage_key                       AS "storageKey",
         m.mime_type                         AS "mimeType",
         m.size_bytes                        AS "sizeBytes",
         m.width, m.height, m.alt, m.caption, m.title, m.folder,
         m.focal_x                           AS "focalX",
         m.focal_y                           AS "focalY",
         m.status,
         /**
          * The accessibility gate, computed rather than stored: an image needs
          * alt text before it may be placed, and a PDF does not.
          */
         (m.status = 'READY'
          AND (m.mime_type NOT LIKE 'image/%' OR COALESCE(btrim(m.alt), '') <> ''))
                                             AS "isReady",
         (SELECT count(*) FROM media_usage u WHERE u.asset_id = m.id)::int AS "usageCount",
         up.full_name                        AS "uploadedByName",
         m.created_at                        AS "createdAt",
         m.deleted_at                        AS "deletedAt"
  FROM media_assets m
  LEFT JOIN users up ON up.id = m.uploaded_by_id
`;

const withUrl = (rows: Row[]): MediaAsset[] =>
  rows.map((r) => ({ ...r, url: publicUrl(String(r.storageKey)) }));

export async function listMedia(
  ctx: RequestContext,
  query: ListMediaQueryInput,
): Promise<{ items: MediaAsset[] }> {
  const term = query.q?.trim();

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`
      ${SELECT_MEDIA}
      WHERE (${query.deleted ?? false} = (m.deleted_at IS NOT NULL))
        AND m.status = 'READY'
        AND (${query.folder ?? null}::text IS NULL OR m.folder = ${query.folder ?? null})
        AND (${query.kind ?? null}::text IS NULL
             OR (${query.kind ?? null} = 'image' AND m.mime_type LIKE 'image/%')
             OR (${query.kind ?? null} = 'pdf'   AND m.mime_type = 'application/pdf'))
        AND (${query.missingAlt ?? false} = false
             OR (m.mime_type LIKE 'image/%' AND COALESCE(btrim(m.alt), '') = ''))
        AND (${term ?? null}::text IS NULL
             OR m.title ILIKE ${'%' + (term ?? '') + '%'}
             OR m.alt   ILIKE ${'%' + (term ?? '') + '%'}
             OR m.storage_key ILIKE ${'%' + (term ?? '') + '%'})
      ORDER BY m.created_at DESC
      LIMIT ${query.limit}
    `);
    return { items: withUrl(Array.from(rows) as Row[]) };
  });
}

export async function getMedia(ctx: RequestContext, id: string): Promise<MediaAsset> {
  const asset = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`${SELECT_MEDIA} WHERE m.id = ${id}`);
    return (Array.from(rows) as Row[]).at(0) ?? null;
  });
  if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Media tidak ditemukan.');
  return withUrl([asset])[0]!;
}

/** Everything currently pointing at an asset, the delete guard's evidence. */
export async function getUsage(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT entity_type AS "entityType", entity_id AS "entityId", field
      FROM media_usage WHERE asset_id = ${id}
      ORDER BY entity_type, created_at
    `);
    return { items: Array.from(rows) };
  });
}

/** Bucket path. Server-chosen so a caller cannot aim an upload anywhere. */
function storageKeyFor(filename: string, folder?: string): string {
  const ext = (filename.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const stem = crypto.randomUUID();
  const prefix = folder ? `${folder}/` : '';
  return `${prefix}${stem}.${ext || 'bin'}`;
}

/**
 * Step one of an upload: reserve a row and hand back a signed URL.
 *
 * The bytes never pass through this service, proxying 10 MB through a
 * serverless function costs memory and time for nothing. The row is created
 * PENDING so the library never shows an image whose upload was interrupted.
 *
 * If the same file has been uploaded before, the existing asset is returned
 * instead. The checksum is client-supplied and therefore untrusted: the worst
 * a wrong one can do is create a duplicate, which is what would have happened
 * without it anyway.
 */
export async function requestUpload(ctx: RequestContext, input: RequestUploadInput) {
  if (input.sizeBytes > MAX_BYTES) {
    throw new ApiError(422, 'FILE_TOO_LARGE', `Maksimal ${MAX_BYTES / 1024 / 1024} MB.`);
  }

  if (input.checksum) {
    const existing = await asUser(ctx, async (tx) => {
      const rows = await tx.execute<Row>(sql`
        ${SELECT_MEDIA}
        WHERE m.checksum = ${input.checksum} AND m.deleted_at IS NULL AND m.status = 'READY'
        LIMIT 1
      `);
      return (Array.from(rows) as Row[]).at(0) ?? null;
    });
    if (existing) {
      return { deduplicated: true as const, asset: withUrl([existing])[0]! };
    }
  }

  const key = storageKeyFor(input.filename, input.folder);

  const { data, error } = await storage.storage.from(MEDIA_BUCKET).createSignedUploadUrl(key);

  if (error || !data) {
    logger.error('media_upload_url_failed', { key, message: error?.message });
    throw new ApiError(502, 'STORAGE_ERROR', 'Tidak bisa menyiapkan unggahan. Coba lagi.');
  }

  const asset = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO media_assets
        (storage_key, mime_type, size_bytes, title, folder, checksum, status, uploaded_by_id)
      VALUES (${key}, ${input.mimeType}, ${input.sizeBytes},
              ${input.title ?? input.filename}, ${input.folder ?? null},
              ${input.checksum ?? null}, 'PENDING', ${ctx.user!.id})
      RETURNING id
    `);
    const created = (Array.from(rows) as { id: string }[]).at(0);
    if (!created) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengunggah media.');
    return created;
  });

  return {
    deduplicated: false as const,
    assetId: asset.id,
    uploadUrl: data.signedUrl,
    token: data.token,
    storageKey: key,
    maxBytes: MAX_BYTES,
  };
}

/**
 * Step two: the browser has uploaded, so verify the object exists and publish
 * the row into the library.
 *
 * The existence check is the point. Without it a failed upload still flips the
 * row to READY and the library shows a broken image that looks completely
 * normal until somebody places it on a page.
 */
export async function confirmUpload(
  ctx: RequestContext,
  id: string,
  input: ConfirmUploadInput,
): Promise<MediaAsset> {
  const asset = await getMedia(ctx, id);
  if (asset.status === 'READY') return asset; // idempotent: a retried confirm is fine

  const folder = asset.storageKey.includes('/')
    ? asset.storageKey.slice(0, asset.storageKey.lastIndexOf('/'))
    : '';
  const name = asset.storageKey.slice(asset.storageKey.lastIndexOf('/') + 1);

  const { data: found, error: listErr } = await storage.storage
    .from(MEDIA_BUCKET)
    .list(folder, { limit: 100, search: name });

  if (listErr) {
    logger.error('media_confirm_list_failed', { id, message: listErr.message });
    throw new ApiError(502, 'STORAGE_ERROR', 'Tidak bisa memverifikasi unggahan.');
  }
  if (!found?.some((f) => f.name === name)) {
    throw new ApiError(422, 'UPLOAD_NOT_FOUND', 'Berkasnya belum sampai. Coba unggah ulang.');
  }

  await asUser(ctx, async (tx) => {
    await tx.execute(sql`
      UPDATE media_assets
      SET status = 'READY', width = ${input.width ?? null}, height = ${input.height ?? null},
          updated_at = now()
      WHERE id = ${id}
    `);
  });

  await writeAuditLog({
    ctx,
    action: 'media.upload',
    entity: 'media',
    entityId: id,
    after: { storageKey: asset.storageKey, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
  });

  return getMedia(ctx, id);
}

export async function updateMedia(
  ctx: RequestContext,
  id: string,
  input: UpdateMediaInput,
): Promise<MediaAsset> {
  const before = await getMedia(ctx, id);

  const COLUMN: Record<string, string> = {
    alt: 'alt',
    caption: 'caption',
    title: 'title',
    folder: 'folder',
    focalX: 'focal_x',
    focalY: 'focal_y',
  };

  const sets = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => sql`${sql.raw(`"${COLUMN[k]}"`)} = ${v as string | number | null}`);

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE media_assets SET ${sql.join(sets, sql`, `)}, updated_at = now()
      WHERE id = ${id} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah media ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'media.update',
    entity: 'media',
    entityId: id,
    before: { alt: before.alt, title: before.title, folder: before.folder },
    after: input,
  });

  return getMedia(ctx, id);
}

/**
 * Swap the bytes behind an existing asset, keeping its id.
 *
 * That is the whole reason replace exists rather than "delete and upload":
 * every reference, a published article's cover, a page's hero, keeps
 * pointing at the same asset and picks up the new image. Uploading a new one
 * would leave every reference on the old file.
 *
 * A new storage key is minted rather than overwriting the old object, because
 * the CDN and every ISR-cached page hold the old URL: overwriting in place
 * serves a mix of old and new for as long as the caches live.
 */
export async function requestReplace(ctx: RequestContext, id: string, input: RequestUploadInput) {
  if (!hasAction(ctx, 'content.publish')) {
    /**
     * Replacing changes what is live everywhere the asset appears, instantly
     * and without going through the editorial pipeline. That is a publishing
     * power, not an authoring one.
     */
    throw new ApiError(
      403,
      'REPLACE_NEEDS_PUBLISHER',
      'Mengganti berkas mengubah semua tempat yang memakainya, butuh izin menerbitkan.',
    );
  }

  const asset = await getMedia(ctx, id);
  if (asset.deletedAt) throw new ApiError(409, 'ASSET_DELETED', 'Media ini sudah dihapus.');

  const key = storageKeyFor(input.filename, asset.folder ?? undefined);
  const { data, error } = await storage.storage.from(MEDIA_BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    logger.error('media_replace_url_failed', { id, message: error?.message });
    throw new ApiError(502, 'STORAGE_ERROR', 'Tidak bisa menyiapkan unggahan. Coba lagi.');
  }

  return {
    assetId: id,
    uploadUrl: data.signedUrl,
    token: data.token,
    storageKey: key,
    previousKey: asset.storageKey,
    maxBytes: MAX_BYTES,
  };
}

/** Finish a replace: point the row at the new object and bin the old one. */
export async function confirmReplace(
  ctx: RequestContext,
  id: string,
  input: {
    storageKey: string;
    width?: number;
    height?: number;
    sizeBytes: number;
    mimeType: string;
  },
): Promise<MediaAsset> {
  if (!hasAction(ctx, 'content.publish')) {
    throw new ApiError(403, 'REPLACE_NEEDS_PUBLISHER', 'Butuh izin menerbitkan.');
  }
  const before = await getMedia(ctx, id);

  const name = input.storageKey.slice(input.storageKey.lastIndexOf('/') + 1);
  const folder = input.storageKey.includes('/')
    ? input.storageKey.slice(0, input.storageKey.lastIndexOf('/'))
    : '';
  const { data: found } = await storage.storage
    .from(MEDIA_BUCKET)
    .list(folder, { limit: 100, search: name });
  if (!found?.some((f) => f.name === name)) {
    throw new ApiError(422, 'UPLOAD_NOT_FOUND', 'Berkas penggantinya belum sampai.');
  }

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE media_assets
      SET storage_key = ${input.storageKey}, mime_type = ${input.mimeType},
          size_bytes = ${input.sizeBytes}, width = ${input.width ?? null},
          height = ${input.height ?? null}, checksum = NULL, updated_at = now()
      WHERE id = ${id} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengganti media ini.');
    }
  });

  /**
   * Remove the old object AFTER the row commits, and never fail the request on
   * it. A leftover object costs a few kilobytes; a failed replace that already
   * changed the database costs an editor's trust in the button.
   */
  const { error: rmErr } = await storage.storage.from(MEDIA_BUCKET).remove([before.storageKey]);
  if (rmErr) logger.warn('media_old_object_orphaned', { id, key: before.storageKey });

  await writeAuditLog({
    ctx,
    action: 'media.replace',
    entity: 'media',
    entityId: id,
    before: { storageKey: before.storageKey },
    after: { storageKey: input.storageKey },
  });

  return getMedia(ctx, id);
}

/**
 * Soft delete, always, and never a hard one.
 *
 * Refused while anything still points at the asset unless `force` is passed,
 * because the caller should see the list first (doc 13 §9.7). Even forced, the
 * bytes survive: `deleted_at` hides it from the library and from `anon`, and
 * `restore` puts it back.
 */
export async function deleteMedia(ctx: RequestContext, id: string, query: DeleteMediaQueryInput) {
  if (!hasAction(ctx, 'content.publish')) {
    throw new ApiError(403, 'DELETE_NEEDS_PUBLISHER', 'Menghapus media butuh izin menerbitkan.');
  }

  const asset = await getMedia(ctx, id);
  if (asset.deletedAt) return { id, deleted: true };

  if (asset.usageCount > 0 && !query.force) {
    throw new ApiError(
      409,
      'MEDIA_IN_USE',
      `Masih dipakai di ${asset.usageCount} tempat. Periksa dulu, atau hapus paksa.`,
    );
  }

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE media_assets SET deleted_at = now(), updated_at = now()
      WHERE id = ${id} AND deleted_at IS NULL RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang menghapus media ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'media.delete',
    entity: 'media',
    entityId: id,
    before: { storageKey: asset.storageKey },
    meta: { usageCount: asset.usageCount, forced: query.force ?? false },
  });

  return { id, deleted: true, usageCount: asset.usageCount };
}

export async function restoreMedia(ctx: RequestContext, id: string) {
  if (!hasAction(ctx, 'content.publish')) {
    throw new ApiError(403, 'DELETE_NEEDS_PUBLISHER', 'Butuh izin menerbitkan.');
  }

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE media_assets SET deleted_at = NULL, updated_at = now()
      WHERE id = ${id} AND deleted_at IS NOT NULL RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Media itu tidak ada di tempat sampah.');
    }
  });

  await writeAuditLog({ ctx, action: 'media.restore', entity: 'media', entityId: id });
  return getMedia(ctx, id);
}

/**
 * Destroy the bytes. Only from the recycle bin, only with nothing pointing at
 * it, and irreversibly.
 *
 * Runs elevated because `media_assets` has no DELETE policy at all, removal
 * through the API is `deleted_at`, and this is the one enumerated path that
 * removes a row for real, after both conditions have been checked.
 */
export async function purgeMedia(ctx: RequestContext, id: string) {
  if (!hasAction(ctx, 'content.publish')) {
    throw new ApiError(403, 'DELETE_NEEDS_PUBLISHER', 'Butuh izin menerbitkan.');
  }

  const asset = await getMedia(ctx, id);
  if (!asset.deletedAt) {
    throw new ApiError(
      409,
      'NOT_DELETED',
      'Hapus dulu ke tempat sampah sebelum memusnahkan permanen.',
    );
  }
  if (asset.usageCount > 0) {
    throw new ApiError(409, 'MEDIA_IN_USE', `Masih dipakai di ${asset.usageCount} tempat.`);
  }

  await withElevatedPrivileges(ctx, 'admin.repair', `purge media ${id}`, async (tx) => {
    await tx.execute(sql`DELETE FROM media_assets WHERE id = ${id}`);
  });

  const { error } = await storage.storage.from(MEDIA_BUCKET).remove([asset.storageKey]);
  if (error) logger.warn('media_object_orphaned', { id, key: asset.storageKey });

  await writeAuditLog({
    ctx,
    action: 'media.purge',
    entity: 'media',
    entityId: id,
    before: { storageKey: asset.storageKey },
  });

  return { id, purged: true };
}
