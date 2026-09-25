import { sql } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import { textArray } from '@/lib/db/sql-values';
import { publicUrl } from '../media/media.service';
import { slugify } from '../articles/articles.service';
import { releaseProgramMedia } from './programs.derive';
import type { CreateProgramInput } from './programs.schema';

/**
 * Programmes: creation, the editor's read, and deletion (doc 14 §2.5).
 *
 * What is NOT here: submit, approve, schedule, publish, unpublish, archive,
 * versions, restore, the 301 on rename, and the draft PATCH. All of that is
 * `modules/content`, a programme is a registered content type, so it inherits
 * the pipeline rather than repeating it, exactly as an article does.
 */

/**
 * One programme, every editable field, in the camelCase the editor expects.
 *
 * Columns are listed rather than `SELECT p.*`. The star returns the database's
 * snake_case while every other endpoint answers camelCase, and 2.3 shipped that
 * bug on articles: the editor read `undefined` for half its fields and rendered
 * them blank, which is indistinguishable from a record with no data.
 */
export async function getProgramForEditor(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT p.id, p.slug, p.name, p.category::text AS category, p.levels,
             p.summary, p.description, p.body, p.cadence, p.locale,
             p.duration_months AS "durationMonths", p.price_monthly AS "priceMonthly",
             p.status::text AS status, p.version,
             p.publish_at AS "publishAt", p.published_at AS "publishedAt",
             p.review_note AS "reviewNote", p.updated_at AS "updatedAt",
             p.cover_id AS "coverId",
             m.storage_key AS "coverKey", m.alt AS "coverAlt"
      FROM programs p
      LEFT JOIN media_assets m ON m.id = p.cover_id
      WHERE p.id = ${id}
    `);
    const row = (Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Program tidak ditemukan.');
    return { ...row, coverUrl: row.coverKey ? publicUrl(String(row.coverKey)) : null };
  });
}

export async function createProgram(ctx: RequestContext, input: CreateProgramInput) {
  const base = slugify(input.slug ?? input.name);

  const created = await asUser(ctx, async (tx) => {
    /**
     * `programs.slug` is UNIQUE globally, so a collision is a 409 rather than
     * the `-2` suffix articles get. A programme is a commercial offer with a
     * price attached; two called the same thing is a mistake to correct at the
     * point of creation, not a duplicate to number.
     */
    const clash = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM programs WHERE slug = ${base}
    `);
    if (((Array.from(clash) as { n: number }[]).at(0)?.n ?? 0) > 0) {
      throw new ApiError(409, 'SLUG_TAKEN', `Alamat "${base}" sudah dipakai program lain.`);
    }

    const rows = await tx.execute<{ id: string; slug: string }>(sql`
      INSERT INTO programs (name, slug, category, levels, price_monthly, duration_months)
      VALUES (${input.name}, ${base}, ${input.category}::program_category,
              ${textArray(input.levels)}, ${input.priceMonthly}, ${input.durationMonths ?? 3})
      RETURNING id, slug
    `);
    const row = (Array.from(rows) as { id: string; slug: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat program.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'program',
    entityId: created.id,
    after: { name: input.name, slug: created.slug, priceMonthly: input.priceMonthly },
  });

  return { id: created.id, slug: created.slug, status: 'DRAFT' as const };
}

export async function deleteProgram(ctx: RequestContext, id: string) {
  const removed = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ status: string; version: number; name: string }>(sql`
      SELECT status::text AS status, version, name FROM programs WHERE id = ${id} FOR UPDATE
    `);
    const row = (Array.from(rows) as { status: string; version: number; name: string }[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Program tidak ditemukan.');

    /**
     * Only a draft that has never been published, the same rule articles use,
     * and stronger here: a programme that has been live may have enrolments and
     * invoices pointing at it, and archiving keeps those readable while taking
     * the page down.
     */
    if (row.status !== 'DRAFT' || row.version > 0) {
      throw new ApiError(
        409,
        'NOT_DELETABLE',
        'Hanya draf yang belum pernah terbit bisa dihapus. Gunakan arsip untuk program yang sudah tayang.',
      );
    }

    const used = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM enrollments WHERE program_id = ${id}
    `);
    const n = (Array.from(used) as { n: number }[]).at(0)?.n ?? 0;
    if (n > 0) {
      throw new ApiError(409, 'PROGRAM_IN_USE', `Program ini dipakai ${n} pendaftaran.`);
    }

    await releaseProgramMedia(tx, id);
    await tx.execute(sql`DELETE FROM programs WHERE id = ${id}`);
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.delete',
    entity: 'program',
    entityId: id,
    before: { name: removed.name, status: removed.status },
  });

  return { id, deleted: true };
}
