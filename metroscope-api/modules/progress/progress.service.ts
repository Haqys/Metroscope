import { sql, type SQL } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type {
  CreateTopicInput,
  ProgressBoardInput,
  UpdateProgressInput,
  UpdateTopicInput,
} from './progress.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Progress, the staleness board (doc 03 FR-UPD-1/2, doc 13 §7.2, doc 14 §3.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FR-UPD-1: "`/progress` is a **staleness board**: students sorted by days
 * since last progress update, so the work surfaces itself." doc 13 gives the
 * threshold in the same breath: *"belum diupdate 14 hari"*.
 *
 * ## This is not the assessment question
 *
 * §3.5 asks "has this month been done", per PERIOD, binary, and it invented no
 * day count because the only one any document gives belongs here. This asks
 * "how long since anybody touched this", in calendar days, continuous, over a
 * different table. Two worries, two queues; collapsing them would leave neither
 * answerable.
 *
 * ## The rule lives in PostgreSQL, once
 *
 * `app.progress_status()`, `app.days_since_wita()` and `app.progress_stale_days()`
 * are migration 0026's. Nothing in this file, in React, or in the tests
 * recomputes them, a `Math.floor((Date.now() - t) / 86400000)` in a component
 * would also make the answer depend on the reader's clock, so two people
 * looking at the same board would see different numbers.
 */

const ISO_FIELDS = ['lastUpdatedAt', 'updatedAt', 'createdAt'] as const;

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

function rethrow(err: unknown): never {
  const driver = (err as { cause?: unknown }).cause ?? err;
  const code = (driver as { code?: string }).code;
  const constraint = (driver as { constraint_name?: string }).constraint_name ?? '';

  if (code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang memperbarui progress.');
  }
  if (code === '23514' && constraint.includes('percent')) {
    throw new ApiError(422, 'INVALID_PERCENT', 'Progress harus antara 0 dan 100.');
  }
  if (code === '23503') {
    throw new ApiError(422, 'UNKNOWN_TARGET', 'Siswa atau topik tidak ditemukan.');
  }
  if (code === '23505') {
    throw new ApiError(409, 'DUPLICATE', 'Data ini sudah ada.');
  }
  throw err;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ═══════════════════════════════════════════════════════════════════════════
//  The board (FR-UPD-1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every ACTIVE student, with when their progress was last touched.
 *
 * A LEFT JOIN from `students` for the same reason §3.5's queue is one: a
 * student nobody has ever recorded progress for has no rows in `progress`, and
 * they are the most important line on the board. Counting progress rows would
 * make them invisible.
 *
 * `status`, `daysSinceUpdate` and the ordering all come from the database
 * functions. This file passes them through and does not recompute them.
 */
export async function progressBoard(ctx: RequestContext, query: ProgressBoardInput) {
  const where: SQL[] = [sql`s.student_status = 'ACTIVE'`];
  if (query.q) where.push(sql`s.name ILIKE ${'%' + query.q + '%'}`);
  if (query.status !== 'all') {
    where.push(sql`app.progress_status(last.at) = ${query.status.toUpperCase()}`);
  }

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      WITH last AS (
        SELECT student_id, max(updated_at) AS at
        FROM progress GROUP BY student_id
      ),
      averages AS (
        SELECT student_id, round(avg(percent))::int AS pct, count(*)::int AS topics
        FROM progress GROUP BY student_id
      )
      SELECT s.id                AS "studentId",
             s.name              AS "studentName",
             s.slug              AS "studentSlug",
             s.level::text       AS level,
             s.account_status::text AS "accountStatus",

             last.at             AS "lastUpdatedAt",
             app.progress_status(last.at)      AS status,
             app.days_since_wita(last.at)      AS "daysSinceUpdate",
             app.progress_updater_name(s.id)   AS "lastUpdatedBy",

             averages.pct        AS "overallPercent",
             COALESCE(averages.topics, 0) AS "topicsTracked",

             COALESCE(
               (SELECT string_agg(p.name, ', ' ORDER BY p.name)
                FROM enrollments e JOIN programs p ON p.id = e.program_id
                WHERE e.student_id = s.id AND e.status = 'ACTIVE'),
               ''
             ) AS "programNames",

             (SELECT count(*)::int
                FROM enrollments e JOIN topics t ON t.program_id = e.program_id
               WHERE e.student_id = s.id AND e.status = 'ACTIVE') AS "topicsAvailable"
      FROM students s
      LEFT JOIN last ON last.student_id = s.id
      LEFT JOIN averages ON averages.student_id = s.id
      WHERE ${sql.join(where, sql` AND `)}
      /**
       * NEVER first, then longest silence, then name.
       *
       * "Never recorded" is not "very stale": a student with no baseline is a
       * different piece of work from one whose numbers have gone quiet, and
       * sorting on days alone would bury the first under the second.
       */
      ORDER BY (last.at IS NOT NULL),
               last.at ASC NULLS FIRST,
               s.name
      LIMIT ${query.limit}
    `);

    /**
     * Counted over the whole ACTIVE roll, never over the filtered list, the
     * §3.5 lesson. The banner says "N siswa belum diperbarui lebih dari dua
     * minggu"; a number that shrank because somebody typed into a search box
     * would be worse than no number.
     */
    const totals = await tx.execute<{
      total: number;
      never: number;
      stale: number;
      current: number;
    }>(sql`
      WITH last AS (
        SELECT student_id, max(updated_at) AS at FROM progress GROUP BY student_id
      ),
      states AS (
        SELECT app.progress_status(last.at) AS state
        FROM students s
        LEFT JOIN last ON last.student_id = s.id
        WHERE s.student_status = 'ACTIVE'
      )
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE state = 'NEVER')::int   AS never,
             count(*) FILTER (WHERE state = 'STALE')::int   AS stale,
             count(*) FILTER (WHERE state = 'CURRENT')::int AS current,
             -- Read, never restated. The threshold has one home: 0026.
             app.progress_stale_days() AS "staleAfterDays"
      FROM states
    `);

    const summary = (Array.from(totals) as Record<string, number>[]).at(0) ?? {
      total: 0,
      never: 0,
      stale: 0,
      current: 0,
      staleAfterDays: 14,
    };
    return {
      /** From app.progress_stale_days(), so the UI cannot state a different rule. */
      staleAfterDays: summary.staleAfterDays,
      items: normalise(Array.from(rows) as Record<string, unknown>[]),
      summary,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  One student (FR-UPD-2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Everything `/progress/[studentId]` and `/portal/progress` render.
 *
 * One payload for a mentor filling sliders and a family reading bars, because
 * the questions are the same, which topics, what percent, when, by whom, and
 * `progress_select` is what makes one of them see only their own children.
 *
 * The topic list comes from the student's ACTIVE enrolments, so a mentor is
 * offered exactly the syllabus the family is paying for. A topic with no
 * progress row yet comes back at `percent: null`, not 0: "not yet assessed" and
 * "assessed at zero" are different statements about a child.
 */
export async function studentProgress(ctx: RequestContext, idOrSlug: string) {
  return asUser(ctx, async (tx) => {
    const found = await tx.execute(sql`
      SELECT s.id, s.name, s.slug, s.level::text AS level,
             s.account_status::text AS "accountStatus",
             s.student_status::text AS "studentStatus",
             COALESCE(
               (SELECT string_agg(p.name, ', ' ORDER BY p.name)
                FROM enrollments e JOIN programs p ON p.id = e.program_id
                WHERE e.student_id = s.id AND e.status = 'ACTIVE'),
               ''
             ) AS "programNames"
      FROM students s
      WHERE ${isUuid(idOrSlug) ? sql`s.id = ${idOrSlug}::uuid` : sql`s.slug = ${idOrSlug}`}
    `);
    const student = (Array.from(found) as Record<string, unknown>[]).at(0);
    /** A miss is a 404 whether the row is absent or invisible to this caller. */
    if (!student) throw new ApiError(404, 'NOT_FOUND', 'Siswa tidak ditemukan.');

    const studentId = student.id as string;

    const topics = await tx.execute(sql`
      SELECT t.id            AS "topicId",
             t.name          AS "topicName",
             t.order_index   AS "orderIndex",
             p.name          AS "programName",
             pr.percent      AS percent,
             pr.updated_at   AS "updatedAt"
      FROM enrollments e
      JOIN programs p ON p.id = e.program_id
      JOIN topics t   ON t.program_id = p.id
      LEFT JOIN progress pr ON pr.topic_id = t.id AND pr.student_id = ${studentId}::uuid
      WHERE e.student_id = ${studentId}::uuid AND e.status = 'ACTIVE'
      ORDER BY p.name, t.order_index, t.name
    `);

    const state = await tx.execute<{
      lastUpdatedAt: unknown;
      status: string;
      daysSinceUpdate: number | null;
      overallPercent: number | null;
      lastUpdatedBy: string | null;
    }>(sql`
      WITH last AS (
        SELECT max(updated_at) AS at, round(avg(percent))::int AS pct
        FROM progress WHERE student_id = ${studentId}::uuid
      )
      SELECT last.at AS "lastUpdatedAt",
             app.progress_status(last.at) AS status,
             app.days_since_wita(last.at) AS "daysSinceUpdate",
             last.pct AS "overallPercent",
             app.progress_updater_name(${studentId}::uuid) AS "lastUpdatedBy"
      FROM last
    `);

    /**
     * The mentor's qualitative note, read from the LATEST ASSESSMENT.
     *
     * `progress` has no note column on purpose: FR-ASN-4's note is already the
     * mentor's words about this child, written monthly and shown to the family.
     * A second note here would be the same fact with two edit paths and two
     * chances to contradict itself on one page.
     */
    const note = await tx.execute<{
      note: string | null;
      period: string;
      author: string | null;
    }>(sql`
      SELECT a.note, a.period, app.assessment_mentor_name(a.id) AS author
      FROM assessments a
      WHERE a.student_id = ${studentId}::uuid AND a.note IS NOT NULL
      ORDER BY a.period DESC
      LIMIT 1
    `);

    /** Read, never restated. The threshold has one home: migration 0026. */
    const threshold = await tx.execute<{ days: number }>(sql`
      SELECT app.progress_stale_days() AS days
    `);

    return {
      student,
      staleAfterDays: (Array.from(threshold) as { days: number }[]).at(0)?.days ?? 14,
      state: normalise(Array.from(state) as Record<string, unknown>[]).at(0) ?? null,
      topics: normalise(Array.from(topics) as Record<string, unknown>[]),
      mentorNote: (Array.from(note) as Record<string, unknown>[]).at(0) ?? null,
    };
  });
}

/**
 * Upsert the sliders that moved (FR-UPD-2).
 *
 * One statement for every entry, so a save is atomic: either the mentor's whole
 * adjustment lands or none of it does, and `updated_at`, the number the entire
 * board is sorted by, never advances for a write that half-failed.
 *
 * `updated_by_id` is `ctx.user.id` and `progress_insert` requires exactly that,
 * so this line being wrong could not attribute an update to a colleague.
 */
export async function updateProgress(
  ctx: RequestContext,
  idOrSlug: string,
  input: UpdateProgressInput,
) {
  const saved = await asUser(ctx, async (tx) => {
    const found = await tx.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM students
      WHERE ${isUuid(idOrSlug) ? sql`id = ${idOrSlug}::uuid` : sql`slug = ${idOrSlug}`}
    `);
    const student = (Array.from(found) as { id: string; name: string }[]).at(0);
    if (!student) throw new ApiError(404, 'NOT_FOUND', 'Siswa tidak ditemukan.');

    /**
     * Every topic must belong to a programme this student is actively enrolled
     * in. A foreign key alone would accept any topic in the database, which
     * would let a mentor record "Geometri 80%" against a child who studies
     * debating, a row no screen would ever show and no one would ever find.
     */
    const topicIds = input.entries.map((e) => e.topicId);
    const eligible = await tx.execute<{ id: string }>(sql`
      SELECT t.id
      FROM topics t
      JOIN enrollments e ON e.program_id = t.program_id
      WHERE e.student_id = ${student.id}::uuid
        AND e.status = 'ACTIVE'
        AND t.id = ANY(${sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(topicIds)}::jsonb))::uuid[]`})
    `);
    const allowed = new Set((Array.from(eligible) as { id: string }[]).map((r) => r.id));
    const stray = topicIds.filter((id) => !allowed.has(id));
    if (stray.length > 0) {
      throw new ApiError(
        422,
        'TOPIC_NOT_ENROLLED',
        'Ada topik yang bukan bagian dari program aktif siswa ini.',
      );
    }

    const values = sql.join(
      input.entries.map(
        (e) =>
          sql`(${student.id}::uuid, ${e.topicId}::uuid, ${e.percent}, ${ctx.user!.id}::uuid, now())`,
      ),
      sql`, `,
    );

    const rows = await tx.execute<{ topicId: string; percent: number }>(sql`
      INSERT INTO progress (student_id, topic_id, percent, updated_by_id, updated_at)
      VALUES ${values}
      ON CONFLICT (student_id, topic_id) DO UPDATE
        SET percent = EXCLUDED.percent,
            updated_by_id = EXCLUDED.updated_by_id,
            updated_at = now()
      RETURNING topic_id AS "topicId", percent
    `);
    const written = Array.from(rows) as { topicId: string; percent: number }[];
    if (written.length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang memperbarui progress.');
    }

    const state = await tx.execute(sql`
      WITH last AS (
        SELECT max(updated_at) AS at, round(avg(percent))::int AS pct
        FROM progress WHERE student_id = ${student.id}::uuid
      )
      SELECT last.at AS "lastUpdatedAt",
             app.progress_status(last.at) AS status,
             app.days_since_wita(last.at) AS "daysSinceUpdate",
             last.pct AS "overallPercent"
      FROM last
    `);

    return {
      studentId: student.id,
      studentName: student.name,
      updated: written,
      state: normalise(Array.from(state) as Record<string, unknown>[]).at(0) ?? null,
    };
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'progress.update',
    entity: 'student',
    entityId: saved.studentId,
    after: { entries: saved.updated, state: saved.state },
  });
  return saved;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Topics. FR-UPD-2's prerequisite
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `topics` has existed since Phase 0 with a read policy and no way to create a
 * row. §3.3 recorded the gap and deferred the editor; FR-UPD-2's per-topic
 * sliders make the deferral load-bearing, because a board of topic percentages
 * over an empty table is a screen with nothing to render.
 *
 * Gated by `material.manage`, the verb doc 13 pairs with the page it puts topic
 * CRUD on. Not an eighteenth verb for four fields on a screen that already has
 * one.
 */
export async function createTopic(ctx: RequestContext, input: CreateTopicInput) {
  const created = await asUser(ctx, async (tx) => {
    /**
     * An omitted `orderIndex` means "last", not zero.
     *
     * `order_index` is NOT NULL with a default, so passing an explicit NULL
     * overrides the default into a constraint violation, and defaulting to 0
     * would silently tie every new topic with the first one. Same +10 spacing
     * `faq_entries` and `mentor_profiles` use, so a topic can be slotted between
     * two others later without renumbering the syllabus.
     */
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO topics (program_id, name, order_index)
      VALUES (${input.programId}::uuid, ${input.name},
              COALESCE(${input.orderIndex ?? null}::int,
                       (SELECT COALESCE(MAX(order_index) + 10, 0)
                          FROM topics WHERE program_id = ${input.programId}::uuid)))
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengelola topik.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'topic.create',
    entity: 'topic',
    entityId: created.id,
    after: { programId: input.programId, name: input.name },
  });
  return { id: created.id };
}

export async function updateTopic(ctx: RequestContext, id: string, input: UpdateTopicInput) {
  const assignments: SQL[] = [];
  if (input.name !== undefined) assignments.push(sql`name = ${input.name}`);
  if (input.orderIndex !== undefined) assignments.push(sql`order_index = ${input.orderIndex}`);

  const updated = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; name: string }>(sql`
      UPDATE topics SET ${sql.join(assignments, sql`, `)}
      WHERE id = ${id}::uuid
      RETURNING id, name
    `);
    const row = (Array.from(rows) as { id: string; name: string }[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Topik tidak ditemukan.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'topic.update',
    entity: 'topic',
    entityId: id,
    after: updated,
  });
  return updated;
}

/**
 * Deleting a topic cascades its progress rows, which is the correct reading of
 * "this topic is no longer part of the syllabus", and the reason the API
 * refuses it once anybody has been scored on it. A percentage a mentor recorded
 * about a child is not something a rename should quietly destroy.
 */
export async function deleteTopic(ctx: RequestContext, id: string) {
  await asUser(ctx, async (tx) => {
    const used = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM progress WHERE topic_id = ${id}::uuid
    `);
    if (((Array.from(used) as { n: number }[]).at(0)?.n ?? 0) > 0) {
      throw new ApiError(
        409,
        'TOPIC_IN_USE',
        'Topik ini sudah dipakai untuk mencatat progress siswa dan tidak bisa dihapus.',
      );
    }
    const rows = await tx.execute<{ id: string }>(sql`
      DELETE FROM topics WHERE id = ${id}::uuid RETURNING id
    `);
    if (!(Array.from(rows) as { id: string }[]).at(0)) {
      throw new ApiError(404, 'NOT_FOUND', 'Topik tidak ditemukan.');
    }
  }).catch(rethrow);

  await writeAuditLog({ ctx, action: 'topic.delete', entity: 'topic', entityId: id });
  return { id };
}
