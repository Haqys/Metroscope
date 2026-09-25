import { sql, type SQL } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { writeAuditLog } from '@/lib/audit';
import { enqueue } from '@/lib/queue';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import { CRITERIA, type CriterionKey } from './assessments.schema';
import type {
  ClaimInput,
  CoverageInput,
  ReactionInput,
  SubmitAssessmentInput,
  UpdateAssessmentInput,
} from './assessments.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Assessments (doc 06 §2.5, doc 13 §12.9, doc 03 FR-ASN/FR-ASV, doc 14 §3.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * doc 13 §12.9: doc 12 §9.1 removed mentor→student ownership, and with nobody
 * assigned, "no one is accountable for a student being assessed". The fix is
 * not to reassign ownership, the client ruled that out, but to publish the
 * gap: **"nobody owns a student; everybody owns the number."**
 *
 * ## Coverage is a PERIOD question
 *
 * FR-ASN-1 defines the queue as "every ACTIVE student × current period, split
 * into *Belum Dinilai (N)* and *Selesai*". So the status is binary and monthly.
 * It is deliberately NOT a days-since-last-touch rule. That is FR-UPD-1, the
 * progress staleness board, and it is §3.6. Keeping the two apart is what lets
 * each answer its own question: "has this month been done" and "how long since
 * anybody looked at this" are not the same worry.
 *
 * Urgency within *Belum Dinilai* is ordering, not a new status: never-assessed
 * first, then longest-since. No threshold is invented, because no document
 * gives one.
 *
 * Every query runs as the caller, so `98_assessments.sql` decides who sees
 * what. There is no ownership filter in this file and there must not be.
 */

/** FR-GAM-5 gives "+120" as the assessment award. One place, so it is findable. */
const POINTS_PER_ASSESSMENT = 120;

/** FR-ASN-2, "soft lock, 24h". */
const CLAIM_HOURS = 24;

const ISO_FIELDS = ['createdAt', 'updatedAt', 'assessedAt', 'claimExpiresAt'] as const;

function normalise<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const field of ISO_FIELDS) {
      const value = toIso(out[field]);
      if (value) out[field] = value;
    }
    /**
     * `numeric` comes back from the driver as a STRING, because 8.1 has no
     * exact float. The portal renders it with `toFixed(1)`, so it has to be a
     * number by the time it leaves here, a hand-written client type that
     * claimed `number` while the wire carried `"8.1"` is the §3.3 failure mode
     * exactly, and `toFixed` on a string throws.
     */
    if (out.avgScore != null) out.avgScore = Number(out.avgScore);
    return out;
  });
}

function rethrow(err: unknown): never {
  const driver = (err as { cause?: unknown }).cause ?? err;
  const code = (driver as { code?: string }).code;
  const constraint = (driver as { constraint_name?: string }).constraint_name ?? '';

  if (code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengisi assessment.');
  }
  if (code === '23505') {
    if (constraint.includes('assessments_student_period_uq')) {
      throw new ApiError(
        409,
        'ALREADY_ASSESSED',
        'Siswa ini sudah dinilai untuk periode tersebut.',
      );
    }
    throw new ApiError(409, 'DUPLICATE', 'Data ini sudah ada.');
  }
  if (code === '23514') {
    if (constraint.includes('period_format')) {
      throw new ApiError(422, 'INVALID_PERIOD', 'Periode harus dalam format YYYY-MM.');
    }
    if (constraint.includes('range')) {
      throw new ApiError(422, 'INVALID_SCORE', 'Skor harus antara 0 dan 10.');
    }
  }
  if (code === '23503') {
    throw new ApiError(422, 'UNKNOWN_STUDENT', 'Siswa tidak ditemukan.');
  }
  throw err;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** WITA `YYYY-MM`. The same answer `app.assessment_period()` gives in SQL. */
export function currentPeriod(at: Date = new Date()): string {
  const wita = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
  }).format(at);
  return wita.slice(0, 7);
}

/** "2026-08" → months elapsed since "2026-05" = 3. */
const periodIndex = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return (y ?? 0) * 12 + (m ?? 0);
};

// ═══════════════════════════════════════════════════════════════════════════
//  The coverage queue (FR-ASN-1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every ACTIVE student × one period, whether or not they have been assessed.
 *
 * A LEFT JOIN from `students`, not a list of assessments, the whole point of a
 * coverage queue is the rows that are NOT there. Counting assessments would
 * make an unassessed child invisible, which is the failure the queue exists to
 * prevent.
 *
 * "ACTIVE" is `student_status`, the column that literally carries that word.
 * `account_status` is returned beside it rather than filtered on: a LIMITED
 * account is a family whose first invoice has not cleared, which is Finance's
 * problem and not a reason to hide a child from their mentor.
 */
export async function coverage(ctx: RequestContext, query: CoverageInput) {
  const period = query.period ?? currentPeriod();

  const where: SQL[] = [sql`s.student_status = 'ACTIVE'`];
  if (query.q) where.push(sql`s.name ILIKE ${'%' + query.q + '%'}`);
  if (query.status === 'pending') where.push(sql`cur.id IS NULL`);
  if (query.status === 'done') where.push(sql`cur.id IS NOT NULL`);

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (student_id) student_id, period
        FROM assessments
        WHERE period <= ${period}
        ORDER BY student_id, period DESC
      )
      SELECT s.id                AS "studentId",
             s.name              AS "studentName",
             s.slug              AS "studentSlug",
             s.level::text       AS level,
             s.account_status::text AS "accountStatus",

             cur.id              AS "assessmentId",
             cur.avg_score       AS "avgScore",
             cur.category::text  AS category,
             cur.created_at      AS "assessedAt",
             u.full_name         AS "assessorName",

             latest.period       AS "lastPeriod",

             cl.mentor_id        AS "claimedById",
             cu.full_name        AS "claimedByName",
             cl.expires_at       AS "claimExpiresAt",

             COALESCE(
               (SELECT string_agg(p.name, ', ' ORDER BY p.name)
                FROM enrollments e JOIN programs p ON p.id = e.program_id
                WHERE e.student_id = s.id AND e.status = 'ACTIVE'),
               ''
             ) AS "programNames"
      FROM students s
      LEFT JOIN assessments cur ON cur.student_id = s.id AND cur.period = ${period}
      LEFT JOIN users u ON u.id = cur.mentor_id
      LEFT JOIN latest ON latest.student_id = s.id
      LEFT JOIN assessment_claims cl
             ON cl.student_id = s.id AND cl.period = ${period} AND cl.expires_at > now()
      LEFT JOIN users cu ON cu.id = cl.mentor_id
      WHERE ${sql.join(where, sql` AND `)}
      /**
       * Most urgent first, and "urgent" is defined without inventing a
       * threshold: unassessed before assessed, never-assessed before
       * ever-assessed, then longest gap, then name for a stable order.
       */
      ORDER BY (cur.id IS NOT NULL),
               (latest.period IS NOT NULL),
               latest.period ASC NULLS FIRST,
               s.name
      LIMIT ${query.limit}
    `);

    const items = normalise(Array.from(rows) as Record<string, unknown>[]).map((row) => {
      const last = row.lastPeriod as string | null;
      return {
        ...row,
        /** 0 when assessed this period, null when never assessed at all. */
        monthsSinceLastAssessment: last ? periodIndex(period) - periodIndex(last) : null,
        status: row.assessmentId ? ('DONE' as const) : ('PENDING' as const),
      };
    });

    /**
     * Counted in SQL over the WHOLE period, not by filtering `items`.
     *
     * `status` and `q` narrow the list; the coverage percentage must not move
     * because somebody typed a name into a search box. FR-ASN-6 puts this exact
     * number in front of the Head on day 1, a number that changes with a
     * filter is not a number anybody can act on.
     */
    const summary = await tx.execute<{ total: number; done: number }>(sql`
      SELECT count(*)::int AS total,
             count(a.id)::int AS done
      FROM students s
      LEFT JOIN assessments a ON a.student_id = s.id AND a.period = ${period}
      WHERE s.student_status = 'ACTIVE'
    `);
    const totals = (Array.from(summary) as { total: number; done: number }[]).at(0) ?? {
      total: 0,
      done: 0,
    };

    return {
      period,
      items,
      summary: {
        total: totals.total,
        done: totals.done,
        pending: totals.total - totals.done,
        /** 100% of nothing is 100%, and it would be a lie on an empty roll. */
        coveragePct: totals.total === 0 ? null : Math.round((totals.done / totals.total) * 100),
      },
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  One student's page (doc 03 §API, `GET /students/:id/assessments`)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Everything `/assessments/[id]` renders, in one call.
 *
 * Serves two very different readers off one policy: a mentor filling the form
 * and a guardian reading their own child's history. `assessments_select` is
 * what separates them, and the payload is the same because the *questions* are
 * the same, what was scored, by whom, when, and what they wrote.
 *
 * A miss is a 404 whether the student does not exist or is not visible to this
 * caller. Telling a guardian that another family's child exists but is not
 * theirs to read is still telling them the child exists.
 */
export async function studentAssessments(ctx: RequestContext, idOrSlug: string, period?: string) {
  const target = period ?? currentPeriod();

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
    if (!student) throw new ApiError(404, 'NOT_FOUND', 'Siswa tidak ditemukan.');

    const studentId = student.id as string;

    const history = await tx.execute(sql`
      SELECT a.id, a.period, a.avg_score AS "avgScore", a.category::text AS category,
             a.note, a.points_awarded AS "pointsAwarded",
             a.mentor_id AS "mentorId",
             -- Behind owner rights: a guardian cannot read the users table (FR-ASV-1).
             app.assessment_mentor_name(a.id) AS "assessorName",
             a.created_at AS "createdAt", a.updated_at AS "updatedAt",
             r.reaction::text AS reaction,
             COALESCE(
               (SELECT json_object_agg(c.criterion, c.score)
                FROM assessment_criteria c WHERE c.assessment_id = a.id),
               '{}'::json
             ) AS scores
      FROM assessments a
      LEFT JOIN assessment_reactions r ON r.assessment_id = a.id
      WHERE a.student_id = ${studentId}::uuid
      ORDER BY a.period DESC
      LIMIT 24
    `);
    const items = normalise(Array.from(history) as Record<string, unknown>[]);

    const claimRows = await tx.execute(sql`
      SELECT cl.mentor_id AS "claimedById", u.full_name AS "claimedByName",
             cl.expires_at AS "claimExpiresAt"
      FROM assessment_claims cl
      LEFT JOIN users u ON u.id = cl.mentor_id
      WHERE cl.student_id = ${studentId}::uuid AND cl.period = ${target}
        AND cl.expires_at > now()
    `);

    return {
      student,
      period: target,
      /** The assessment for the period being filled, if it already exists. */
      current: items.find((a) => a.period === target) ?? null,
      /** The most recent one BEFORE it, what a mentor wants beside the form. */
      previous: items.find((a) => (a.period as string) < target) ?? null,
      items,
      claim: normalise(Array.from(claimRows) as Record<string, unknown>[]).at(0) ?? null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Writes
// ═══════════════════════════════════════════════════════════════════════════

function criteriaValues(assessmentId: string, scores: Record<CriterionKey, number>): SQL {
  return sql.join(
    CRITERIA.map(
      (key) => sql`(${assessmentId}::uuid, ${key}::assessment_criterion, ${scores[key]})`,
    ),
    sql`, `,
  );
}

/**
 * Submit (FR-ASN-5).
 *
 * One transaction: the row, its four criteria, and the claim release. The
 * average and the category are NOT written here, the trigger on
 * `assessment_criteria` derives them, so this service cannot produce an
 * assessment whose headline score disagrees with its own scores.
 *
 * `mentor_id` is `ctx.user.id` and `assessments_insert` requires exactly that,
 * so a caller cannot file an evaluation under a colleague's name even if this
 * line were wrong.
 */
export async function submitAssessment(ctx: RequestContext, input: SubmitAssessmentInput) {
  const period = input.period ?? currentPeriod();

  const created = await asUser(ctx, async (tx) => {
    /**
     * FR-ASN-2's lock, enforced at the moment it matters.
     *
     * A live claim by SOMEBODY ELSE stops the write; the claimant's own claim
     * does not. This is the only place the soft lock has teeth, and it is
     * checked inside the same transaction as the insert so two mentors racing
     * cannot both pass it.
     */
    const claim = await tx.execute<{ mentorId: string; claimedByName: string | null }>(sql`
      SELECT cl.mentor_id AS "mentorId", u.full_name AS "claimedByName"
      FROM assessment_claims cl
      LEFT JOIN users u ON u.id = cl.mentor_id
      WHERE cl.student_id = ${input.studentId}::uuid
        AND cl.period = ${period}
        AND cl.expires_at > now()
      FOR UPDATE OF cl
    `);
    const held = (Array.from(claim) as { mentorId: string; claimedByName: string | null }[]).at(0);
    if (held && held.mentorId !== ctx.user!.id) {
      throw new ApiError(
        409,
        'CLAIMED_BY_OTHER',
        `${held.claimedByName ?? 'Mentor lain'} sedang mengisi assessment siswa ini.`,
      );
    }

    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO assessments (student_id, mentor_id, period, note, points_awarded)
      VALUES (${input.studentId}::uuid, ${ctx.user!.id}::uuid, ${period},
              ${input.note}, ${POINTS_PER_ASSESSMENT})
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengisi assessment.');

    await tx.execute(sql`
      INSERT INTO assessment_criteria (assessment_id, criterion, score)
      VALUES ${criteriaValues(row.id, input.scores)}
    `);

    /** The slot is filled; holding the lock past that helps nobody. */
    await tx.execute(sql`
      DELETE FROM assessment_claims
      WHERE student_id = ${input.studentId}::uuid AND period = ${period}
    `);

    const back = await tx.execute(sql`
      SELECT id, period, avg_score AS "avgScore", category::text AS category,
             points_awarded AS "pointsAwarded"
      FROM assessments WHERE id = ${row.id}::uuid
    `);
    return normalise(Array.from(back) as Record<string, unknown>[])[0]!;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'assessment.submit',
    entity: 'assessment',
    entityId: created.id as string,
    after: { studentId: input.studentId, period, avgScore: created.avgScore },
  });

  /**
   * FR-ASN-5, "notifies the parent". Enqueued after the transaction commits,
   * so a delivery failure cannot roll back a recorded evaluation.
   */
  await enqueue('notification.assessment-ready', { assessmentId: created.id });

  return created;
}

/** A correction by the author. `assessments_update` refuses everybody else. */
export async function updateAssessment(
  ctx: RequestContext,
  id: string,
  input: UpdateAssessmentInput,
) {
  if (input.note === undefined && input.scores === undefined) {
    throw new ApiError(422, 'NO_CHANGES', 'Tidak ada yang diubah.');
  }

  const updated = await asUser(ctx, async (tx) => {
    if (input.note !== undefined) {
      const rows = await tx.execute<{ id: string }>(sql`
        UPDATE assessments SET note = ${input.note}, updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING id
      `);
      if (!(Array.from(rows) as { id: string }[]).at(0)) {
        /**
         * The row may be readable (a Head holds `/assessments`) and still not
         * writable, `assessments_update` narrows to the author. An empty
         * RETURNING is that refusal, not a missing row.
         */
        throw new ApiError(403, 'FORBIDDEN', 'Hanya penulis assessment yang bisa mengubahnya.');
      }
    }

    if (input.scores) {
      /**
       * Written as an upsert over the four keys rather than delete-then-insert:
       * the trigger fires per row, and a DELETE of all four would recompute the
       * average to 0 in between, briefly writing a zero onto a child's report.
       */
      await tx.execute(sql`
        INSERT INTO assessment_criteria (assessment_id, criterion, score)
        VALUES ${criteriaValues(id, input.scores)}
        ON CONFLICT (assessment_id, criterion) DO UPDATE SET score = EXCLUDED.score
      `);
    }

    const back = await tx.execute(sql`
      SELECT id, period, avg_score AS "avgScore", category::text AS category, note
      FROM assessments WHERE id = ${id}::uuid
    `);
    const row = normalise(Array.from(back) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Assessment tidak ditemukan.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'assessment.update',
    entity: 'assessment',
    entityId: id,
    after: updated,
  });
  return updated;
}

/**
 * Claim a slot (FR-ASN-2).
 *
 * Takeover of an EXPIRED claim is the interesting case and it is one statement:
 * the `ON CONFLICT` fires on the primary key, and the `WHERE` on the DO UPDATE
 * lets it through only when the incumbent has lapsed or is the caller. A live
 * claim by somebody else updates nothing, returns nothing, and becomes a 409.
 */
export async function claimStudent(ctx: RequestContext, input: ClaimInput) {
  const period = input.period ?? currentPeriod();

  const claimed = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ expiresAt: string }>(sql`
      INSERT INTO assessment_claims (student_id, period, mentor_id, expires_at)
      VALUES (${input.studentId}::uuid, ${period}, ${ctx.user!.id}::uuid,
              now() + ${`${CLAIM_HOURS} hours`}::interval)
      ON CONFLICT (student_id, period) DO UPDATE
        SET mentor_id = EXCLUDED.mentor_id,
            claimed_at = now(),
            expires_at = EXCLUDED.expires_at
        WHERE assessment_claims.expires_at < now()
           OR assessment_claims.mentor_id = ${ctx.user!.id}::uuid
      RETURNING expires_at AS "expiresAt"
    `);
    const row = (Array.from(rows) as { expiresAt: string }[]).at(0);
    if (!row) {
      const holder = await tx.execute<{ name: string | null }>(sql`
        SELECT u.full_name AS name
        FROM assessment_claims cl LEFT JOIN users u ON u.id = cl.mentor_id
        WHERE cl.student_id = ${input.studentId}::uuid AND cl.period = ${period}
      `);
      const name = (Array.from(holder) as { name: string | null }[]).at(0)?.name;
      throw new ApiError(
        409,
        'CLAIMED_BY_OTHER',
        `${name ?? 'Mentor lain'} sedang mengisi assessment siswa ini.`,
      );
    }
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'assessment.claim',
    entity: 'student',
    entityId: input.studentId,
    after: { period, expiresAt: claimed.expiresAt },
  });
  return { studentId: input.studentId, period, expiresAt: toIso(claimed.expiresAt) };
}

/** Release. Any mentor may release any claim. FR-ASN-2 calls it a SOFT lock. */
export async function releaseClaim(ctx: RequestContext, studentId: string, period?: string) {
  const target = period ?? currentPeriod();

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ studentId: string }>(sql`
      DELETE FROM assessment_claims
      WHERE student_id = ${studentId}::uuid AND period = ${target}
      RETURNING student_id AS "studentId"
    `);
    if (!(Array.from(rows) as { studentId: string }[]).at(0)) {
      throw new ApiError(404, 'NOT_FOUND', 'Tidak ada klaim untuk siswa ini.');
    }
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'assessment.release',
    entity: 'student',
    entityId: studentId,
    before: { period: target },
  });
  return { studentId, period: target };
}

/**
 * FR-ASV-4, the family's one reply.
 *
 * Authorised by OWNERSHIP, not by a verb, and `assessment_reactions_write`
 * refuses staff entirely: a mentor marking their own assessment "helpful" would
 * make the number describe the staff rather than the families.
 */
export async function reactToAssessment(ctx: RequestContext, id: string, input: ReactionInput) {
  const saved = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ reaction: string }>(sql`
      INSERT INTO assessment_reactions (assessment_id, reaction)
      VALUES (${id}::uuid, ${input.reaction}::assessment_reaction_kind)
      ON CONFLICT (assessment_id) DO UPDATE
        SET reaction = EXCLUDED.reaction, updated_at = now()
      RETURNING reaction::text AS reaction
    `);
    const row = (Array.from(rows) as { reaction: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang memberi apresiasi.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'assessment.react',
    entity: 'assessment',
    entityId: id,
    after: { reaction: saved.reaction },
  });
  return { assessmentId: id, reaction: saved.reaction };
}
