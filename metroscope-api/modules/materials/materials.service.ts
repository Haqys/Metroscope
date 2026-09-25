import { sql, type SQL } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type {
  AssignMaterialInput,
  CreateMaterialInput,
  ListMaterialsInput,
  MaterialStatusInput,
  ProgressInput,
  ResourceInput,
  UpdateMaterialInput,
} from './materials.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Learning materials (doc 06 §2.3, doc 13 §12.7, doc 14 §3.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every query runs as the caller, so `96_materials.sql` decides who sees what.
 * There is no entitlement check in this file and there must not be: the rule
 * lives once, in `app.student_entitled_to_material()`, and a JS copy would be
 * the version that eventually hands a paid module to a family that was never
 * given it.
 *
 * ## Entitlement is not consumption
 *
 * `material_assignments` says who MAY see a module. One row can cover a whole
 * programme or a whole school level. `material_progress` says what one student
 * DID with it. The portal list is a join of the two, and the two are counted
 * differently: a module assigned to 40 children and opened by 3 is one
 * assignment row and three progress rows.
 */

const MATERIAL_COLUMNS = sql`
  m.id, m.title, m.slug, m.description, m.order_index AS "orderIndex",
  m.status::text AS status, m.published_at AS "publishedAt",
  m.topic_id AS "topicId", t.name AS "topicName",
  m.created_at AS "createdAt", m.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM material_resources r WHERE r.material_id = m.id) AS "resourceCount",
  (SELECT count(*)::int FROM material_assignments a WHERE a.material_id = m.id) AS "assignmentCount"
`;

const ISO_FIELDS = ['publishedAt', 'createdAt', 'updatedAt', 'openedAt', 'completedAt'] as const;

function normalise<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const field of ISO_FIELDS) {
      const value = toIso(out[field]);
      if (value) out[field] = value;
    }
    return out;
  });
}

function rethrowDenied(err: unknown): never {
  const driver = (err as { cause?: unknown }).cause ?? err;
  const code = (driver as { code?: string }).code;
  if (code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengelola materi.');
  }
  if (code === '23505') {
    const constraint = (driver as { constraint_name?: string }).constraint_name ?? '';
    if (constraint.includes('slug')) {
      throw new ApiError(409, 'SLUG_TAKEN', 'Slug materi ini sudah dipakai.');
    }
    throw new ApiError(409, 'ALREADY_ASSIGNED', 'Materi ini sudah diberikan ke sasaran tersebut.');
  }
  /** The one-scope CHECK. Zod says the same thing first; this is the backstop. */
  if (code === '23514') {
    throw new ApiError(
      422,
      'INVALID_SCOPE',
      'Pilih tepat satu sasaran: siswa, program, atau jenjang.',
    );
  }
  throw err;
}

/** "Modul 1: Aljabar Dasar" → "modul-1-aljabar-dasar". */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 110) || 'materi'
  );
}

/**
 * The module list.
 *
 * For a guardian this is entitlement-filtered by RLS and carries their child's
 * progress; for staff it is the library, including drafts. One endpoint, two
 * answers, because the question, "which modules are there", is the same one
 * and a second endpoint would be a second place to get the filter wrong.
 */
export async function listMaterials(ctx: RequestContext, query: ListMaterialsInput) {
  const where: SQL[] = [sql`TRUE`];
  if (query.topicId) where.push(sql`m.topic_id = ${query.topicId}::uuid`);
  if (query.status) where.push(sql`m.status = ${query.status}::content_status`);
  if (query.q) where.push(sql`m.title ILIKE ${'%' + query.q + '%'}`);

  /**
   * Archived modules are absent unless asked for by status. They are not
   * deleted, a student who studied one still has progress against it, but a
   * library that shows everything ever retired is a library nobody scrolls.
   */
  if (!query.status) where.push(sql`m.status <> 'ARCHIVED'`);

  const student = query.studentId ?? null;

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${MATERIAL_COLUMNS},
             p.status::text AS "progressStatus",
             p.opened_at    AS "openedAt",
             p.completed_at AS "completedAt"
      FROM materials m
      LEFT JOIN topics t ON t.id = m.topic_id
      LEFT JOIN material_progress p
             ON p.material_id = m.id AND p.student_id = ${student}::uuid
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY m.order_index, m.title
      LIMIT ${query.limit}
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

export async function getMaterial(ctx: RequestContext, idOrSlug: string, studentId?: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${MATERIAL_COLUMNS},
             p.status::text AS "progressStatus",
             p.opened_at    AS "openedAt",
             p.completed_at AS "completedAt"
      FROM materials m
      LEFT JOIN topics t ON t.id = m.topic_id
      LEFT JOIN material_progress p
             ON p.material_id = m.id AND p.student_id = ${studentId ?? null}::uuid
      WHERE ${isUuid ? sql`m.id = ${idOrSlug}::uuid` : sql`m.slug = ${idOrSlug}`}
    `);
    const material = normalise(Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!material) throw new ApiError(404, 'NOT_FOUND', 'Materi tidak ditemukan.');

    const resources = await tx.execute(sql`
      SELECT id, kind::text AS kind, title, url, duration_min AS "durationMin",
             order_index AS "orderIndex"
      FROM material_resources
      WHERE material_id = ${material.id}::uuid
      ORDER BY order_index, title
    `);

    return { ...material, resources: Array.from(resources) };
  });
}

export async function createMaterial(ctx: RequestContext, input: CreateMaterialInput) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`
        INSERT INTO materials (title, slug, topic_id, description, order_index, created_by_id)
        VALUES (${input.title}, ${input.slug ?? slugify(input.title)},
                ${input.topicId ?? null}::uuid, ${input.description ?? null},
                ${input.orderIndex ?? 0}, ${ctx.user!.id}::uuid)
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat materi.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'material.create',
    entity: 'material',
    entityId: created.id,
    after: { ...input },
  });
  return getMaterial(ctx, created.id);
}

export async function updateMaterial(ctx: RequestContext, id: string, input: UpdateMaterialInput) {
  await asUser(ctx, async (tx) => {
    const sets: SQL[] = [sql`updated_at = now()`];
    if (input.title) sets.push(sql`title = ${input.title}`);
    if (input.slug) sets.push(sql`slug = ${input.slug}`);
    if (input.topicId !== undefined) sets.push(sql`topic_id = ${input.topicId}::uuid`);
    if (input.description !== undefined) sets.push(sql`description = ${input.description}`);
    if (input.orderIndex !== undefined) sets.push(sql`order_index = ${input.orderIndex}`);

    const rows = await tx
      .execute<{ id: string }>(
        sql`UPDATE materials SET ${sql.join(sets, sql`, `)} WHERE id = ${id}::uuid RETURNING id`,
      )
      .catch(rethrowDenied);

    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah materi ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'material.update',
    entity: 'material',
    entityId: id,
    after: { ...input },
  });
  return getMaterial(ctx, id);
}

/**
 * The publish state doc 13 §12.7 asks for.
 *
 * Publishing refuses a module with no resources. A "module" that opens to an
 * empty page is exactly the half-finished thing the publish state exists to
 * keep out of the portal, and a parent who clicks into one concludes the
 * product is broken rather than that the module is unfinished.
 */
export async function setMaterialStatus(
  ctx: RequestContext,
  id: string,
  input: MaterialStatusInput,
) {
  await asUser(ctx, async (tx) => {
    if (input.status === 'PUBLISHED') {
      const counted = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM material_resources WHERE material_id = ${id}::uuid`,
      );
      if ((Array.from(counted).at(0)?.n ?? 0) === 0) {
        throw new ApiError(
          422,
          'MATERIAL_EMPTY',
          'Materi tanpa satu pun sumber belajar tidak bisa diterbitkan.',
        );
      }
    }

    const rows = await tx
      .execute<{ id: string }>(
        sql`
        UPDATE materials
        SET status = ${input.status}::content_status,
            published_at = CASE WHEN ${input.status} = 'PUBLISHED'
                                THEN COALESCE(published_at, now()) ELSE published_at END,
            updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah status materi.');
    }
  });

  await writeAuditLog({
    ctx,
    action: `material.${input.status.toLowerCase()}`,
    entity: 'material',
    entityId: id,
    after: { ...input },
  });
  return getMaterial(ctx, id);
}

export async function addResource(ctx: RequestContext, materialId: string, input: ResourceInput) {
  const created = await asUser(ctx, async (tx) => {
    /**
     * Appended to the end unless told otherwise. `MAX(order_index) + 1` in its
     * own statement rather than beside the INSERT's other columns, §2.6 hit a
     * 500 putting an aggregate next to a non-aggregated column.
     */
    const next = await tx.execute<{ n: number }>(
      sql`SELECT COALESCE(MAX(order_index), -1) + 1 AS n
          FROM material_resources WHERE material_id = ${materialId}::uuid`,
    );
    const order = input.orderIndex ?? Array.from(next).at(0)?.n ?? 0;

    const rows = await tx
      .execute<{ id: string }>(
        sql`
        INSERT INTO material_resources (material_id, kind, title, url, duration_min, order_index)
        VALUES (${materialId}::uuid, ${input.kind}::material_kind, ${input.title}, ${input.url},
                ${input.durationMin ?? null}, ${order})
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang menambah sumber belajar.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'material.resource-add',
    entity: 'material',
    entityId: materialId,
    after: { ...input, resourceId: created.id },
  });
  return getMaterial(ctx, materialId);
}

export async function removeResource(ctx: RequestContext, materialId: string, resourceId: string) {
  await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`DELETE FROM material_resources
            WHERE id = ${resourceId}::uuid AND material_id = ${materialId}::uuid
            RETURNING id`,
      )
      .catch(rethrowDenied);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Sumber belajar tidak ditemukan.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'material.resource-remove',
    entity: 'material',
    entityId: materialId,
    after: { resourceId },
  });
  return getMaterial(ctx, materialId);
}

/** Give a module to one student, a whole programme, or a whole level. */
export async function assignMaterial(
  ctx: RequestContext,
  materialId: string,
  input: AssignMaterialInput,
) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`
        INSERT INTO material_assignments (material_id, student_id, program_id, level, assigned_by_id)
        VALUES (${materialId}::uuid, ${input.studentId ?? null}::uuid,
                ${input.programId ?? null}::uuid, ${input.level ?? null}::school_level,
                ${ctx.user!.id}::uuid)
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang memberikan materi.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'material.assign',
    entity: 'material',
    entityId: materialId,
    after: { ...input, assignmentId: created.id },
  });
  return listAssignments(ctx, materialId);
}

export async function unassignMaterial(
  ctx: RequestContext,
  materialId: string,
  assignmentId: string,
) {
  await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`DELETE FROM material_assignments
            WHERE id = ${assignmentId}::uuid AND material_id = ${materialId}::uuid
            RETURNING id`,
      )
      .catch(rethrowDenied);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Pemberian materi tidak ditemukan.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'material.unassign',
    entity: 'material',
    entityId: materialId,
    after: { assignmentId },
  });
  return listAssignments(ctx, materialId);
}

export async function listAssignments(ctx: RequestContext, materialId: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT a.id, a.student_id AS "studentId", a.program_id AS "programId",
             a.level::text AS level, a.created_at AS "createdAt",
             st.name AS "studentName", p.name AS "programName"
      FROM material_assignments a
      LEFT JOIN students st ON st.id = a.student_id
      LEFT JOIN programs p ON p.id = a.program_id
      WHERE a.material_id = ${materialId}::uuid
      ORDER BY a.created_at
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

/**
 * "Who opened it", the per-material engagement doc 13 §12.7 asks for.
 *
 * Every entitled student, with their status, rather than only the ones who have
 * a progress row. The absence of a row IS the finding: a module given to forty
 * children and opened by three is what a mentor needs to see, and a list of
 * three tells them nothing about the thirty-seven.
 */
export async function materialEngagement(ctx: RequestContext, materialId: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT s.id AS "studentId", s.name AS "studentName", s.level::text AS level,
             COALESCE(p.status::text, 'NOT_STARTED') AS status,
             p.opened_at AS "openedAt", p.completed_at AS "completedAt"
      FROM students s
      LEFT JOIN material_progress p
             ON p.student_id = s.id AND p.material_id = ${materialId}::uuid
      WHERE app.student_entitled_to_material(s.id, ${materialId}::uuid)
      ORDER BY s.name
    `);

    const items = normalise(Array.from(rows) as Record<string, unknown>[]);
    const counts = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0 } as Record<string, number>;
    for (const row of items) counts[String(row.status)] = (counts[String(row.status)] ?? 0) + 1;

    return { items, counts, entitled: items.length };
  });
}

/**
 * Record that a student opened or finished a module.
 *
 * Written by the FAMILY, never by staff, `material_progress_write` says so.
 * A mentor marking a module "selesai" on a student's behalf would make the
 * engagement number describe the staff rather than the students, which is the
 * one thing this table exists to measure.
 *
 * `opened_at` is stamped once and never moved; `completed_at` only when DONE.
 * Re-opening a finished module does not un-finish it.
 */
export async function setProgress(ctx: RequestContext, materialId: string, input: ProgressInput) {
  await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ student_id: string }>(
        sql`
        INSERT INTO material_progress (student_id, material_id, status, opened_at, completed_at, updated_at)
        VALUES (${input.studentId}::uuid, ${materialId}::uuid,
                ${input.status}::material_progress_status,
                CASE WHEN ${input.status} <> 'NOT_STARTED' THEN now() END,
                CASE WHEN ${input.status} = 'DONE' THEN now() END,
                now())
        ON CONFLICT (student_id, material_id) DO UPDATE SET
          status = EXCLUDED.status,
          opened_at = COALESCE(material_progress.opened_at, EXCLUDED.opened_at),
          completed_at = CASE WHEN EXCLUDED.status = 'DONE'
                              THEN COALESCE(material_progress.completed_at, now())
                              ELSE NULL END,
          updated_at = now()
        RETURNING student_id
      `,
      )
      .catch(rethrowDenied);

    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mencatat progres materi ini.');
    }
  });

  return getMaterial(ctx, materialId, input.studentId);
}

/** Topics, for the library's filter chips and the material form. */
export async function listTopics(ctx: RequestContext) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT t.id, t.name, t.program_id AS "programId", p.name AS "programName",
             t.order_index AS "orderIndex"
      FROM topics t
      LEFT JOIN programs p ON p.id = t.program_id
      ORDER BY p.name NULLS FIRST, t.order_index, t.name
    `);
    return { items: Array.from(rows) };
  });
}
