import { sql, type SQL } from 'drizzle-orm';
import { asUser, asAnon } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { textArray } from '@/lib/db/sql-values';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type {
  AddTargetInput,
  AddTeamMemberInput,
  CreateCompetitionInput,
  CreateTeamInput,
  ListCompetitionsInput,
  PublicCompetitionsInput,
  UpdateTargetInput,
} from './competitions.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Competitions (doc 06 §7.3, doc 13 §12.8, doc 14 §3.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * doc 13 §P7: "Internal CRUD writes to one place; the portal reads a hardcoded
 * catalog of 3 lomba. Adding a lomba in the admin changes nothing for students."
 * Every read below, internal table, portal Info Lomba, the public marketing
 * calendar, comes out of the same three tables, which is the entire point.
 *
 * The catalogue's WRITES are not here. A competition is a registered content
 * type, so `content.service.ts` owns its draft edits and its publish; this file
 * owns creation (the row has to exist before the pipeline can move it) and
 * everything that hangs off it: participants, readiness, results, teams.
 */

const COMPETITION_COLUMNS = sql`
  c.id, c.slug, c.name, c.summary, c.description,
  c.organizer, c.venue,
  c.level::text AS level, c.format::text AS format, c.mode::text AS mode,
  c.categories, c.levels,
  c.registration_fee AS "registrationFee", c.fee_note AS "feeNote",
  c.registration_url AS "registrationUrl", c.guidebook_url AS "guidebookUrl",
  c.registration_opens_at AS "registrationOpensAt",
  c.registration_deadline AS "registrationDeadline",
  c.event_start AS "eventStart", c.event_end AS "eventEnd",
  c.status::text AS status, c.published_at AS "publishedAt",
  c.cover_id AS "coverId",
  app.competition_phase(c.registration_opens_at, c.registration_deadline) AS phase
`;

/**
 * Participant counts and readiness, computed in the same statement as the row.
 *
 * The average is `NULL` when nobody is entered rather than 0: "nobody has been
 * entered yet" and "everybody is at zero readiness" are different findings, and
 * the fixture's flat `readiness: 72` could express neither.
 */
const TARGET_ROLLUP = sql`
  (SELECT count(*)::int FROM competition_targets t WHERE t.competition_id = c.id) AS "targetCount",
  (SELECT round(avg(t.readiness_pct))::int FROM competition_targets t
    WHERE t.competition_id = c.id) AS "avgReadiness",
  (SELECT count(*)::int FROM competition_targets t
    WHERE t.competition_id = c.id AND t.result = 'WINNER') AS "winnerCount",
  (SELECT count(*)::int FROM teams tm WHERE tm.competition_id = c.id) AS "teamCount"
`;

const ISO_FIELDS = [
  'registrationOpensAt',
  'registrationDeadline',
  'publishedAt',
  'createdAt',
  'updatedAt',
  'recordedAt',
] as const;

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

/**
 * RLS denies a WRITE by raising 42501; it denies a READ by returning no rows.
 * Drizzle wraps the driver error, so the Postgres code is on `.cause`, reading
 * it off the thrown object instead turns every denial into a 500, which is the
 * mistake §3.1 made on every double-booking before it was found.
 */
function rethrow(err: unknown): never {
  const driver = (err as { cause?: unknown }).cause ?? err;
  const code = (driver as { code?: string }).code;
  const constraint = (driver as { constraint_name?: string }).constraint_name ?? '';

  if (code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah data lomba.');
  }
  if (code === '23505') {
    if (constraint.includes('competition_targets_student_uq')) {
      throw new ApiError(409, 'ALREADY_ENTERED', 'Siswa ini sudah terdaftar di lomba tersebut.');
    }
    if (constraint.includes('team_members_one_team_per_competition')) {
      throw new ApiError(409, 'ALREADY_IN_TEAM', 'Siswa ini sudah masuk tim lain di lomba ini.');
    }
    if (constraint.includes('team_members_one_leader')) {
      throw new ApiError(409, 'LEADER_EXISTS', 'Tim ini sudah punya ketua.');
    }
    if (constraint.includes('teams_competition_name_uq')) {
      throw new ApiError(409, 'TEAM_NAME_TAKEN', 'Nama tim sudah dipakai di lomba ini.');
    }
    if (constraint.includes('slug')) {
      throw new ApiError(409, 'SLUG_TAKEN', 'Slug lomba ini sudah dipakai.');
    }
    throw new ApiError(409, 'DUPLICATE', 'Data ini sudah ada.');
  }
  /**
   * The composite FK from `team_members` to `competition_targets`. Adding a
   * child to a team without entering them in the lomba first is the mistake
   * that produces a participant with no readiness and no result on the day the
   * certificates are written, so the database refuses it outright.
   */
  if (code === '23503' && constraint.includes('team_members_target_fk')) {
    throw new ApiError(
      422,
      'NOT_A_PARTICIPANT',
      'Daftarkan siswa ke lomba ini dulu sebelum memasukkannya ke tim.',
    );
  }
  if (code === '23514' && constraint.includes('readiness')) {
    throw new ApiError(422, 'INVALID_READINESS', 'Kesiapan harus antara 0 dan 100.');
  }
  throw err;
}

/** "OSN Matematika 2026" → "osn-matematika-2026". */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 110) || 'lomba'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Reads
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The catalogue.
 *
 * One endpoint answers three questions, because they are the same question
 * asked by different people: the internal table wants drafts and rollups, the
 * portal's "Jelajahi Lomba" wants what is published, and "Lomba Saya" is the
 * same list narrowed by `studentId`. `97_competitions.sql` decides which rows
 * come back. There is no status filter here beyond what was explicitly asked
 * for, and adding one would be a second, weaker copy of the policy.
 */
export async function listCompetitions(ctx: RequestContext, query: ListCompetitionsInput) {
  const where: SQL[] = [sql`TRUE`];
  if (query.q) where.push(sql`c.name ILIKE ${'%' + query.q + '%'}`);
  if (query.level) where.push(sql`c.level = ${query.level}::competition_level`);
  if (query.schoolLevel) where.push(sql`${query.schoolLevel} = ANY (c.levels)`);
  if (query.status) where.push(sql`c.status = ${query.status}::content_status`);
  if (query.phase) {
    where.push(
      sql`app.competition_phase(c.registration_opens_at, c.registration_deadline) = ${query.phase}`,
    );
  }
  /** Archived lomba stay out of the list unless asked for by status, as with materials. */
  if (!query.status) where.push(sql`c.status <> 'ARCHIVED'`);
  if (query.studentId) {
    where.push(sql`EXISTS (
      SELECT 1 FROM competition_targets t
      WHERE t.competition_id = c.id AND t.student_id = ${query.studentId}::uuid
    )`);
  }

  const student = query.studentId ?? null;

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${COMPETITION_COLUMNS}, ${TARGET_ROLLUP},
             mt.id             AS "myTargetId",
             mt.readiness_pct  AS "myReadiness",
             mt.result::text   AS "myResult",
             mt.award          AS "myAward"
      FROM competitions c
      LEFT JOIN competition_targets mt
             ON mt.competition_id = c.id AND mt.student_id = ${student}::uuid
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY c.registration_deadline
      LIMIT ${query.limit}
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

/**
 * One competition, with everything doc 13 §12.8 asks the detail page to show:
 * "participants, teams, readiness distribution, deadline checklist".
 *
 * Four queries in one transaction rather than one query with three lateral
 * joins, the participant list and the team list are different cardinalities,
 * and flattening them into one result set means de-duplicating in JavaScript
 * what the database already had right.
 */
export async function getCompetition(ctx: RequestContext, idOrSlug: string) {
  return asUser(ctx, async (tx) => {
    const found = await tx.execute(sql`
      SELECT ${COMPETITION_COLUMNS}, ${TARGET_ROLLUP},
             c.created_at AS "createdAt", c.updated_at AS "updatedAt",
             c.version, c.publish_at AS "publishAt"
      FROM competitions c
      WHERE ${isUuid(idOrSlug) ? sql`c.id = ${idOrSlug}::uuid` : sql`c.slug = ${idOrSlug}`}
    `);
    const competition = normalise(Array.from(found) as Record<string, unknown>[]).at(0);
    /**
     * A miss is a 404 whether the row is absent or merely invisible. Telling an
     * unauthorised caller that a competition exists but is not theirs to see is
     * still telling them it exists.
     */
    if (!competition) throw new ApiError(404, 'NOT_FOUND', 'Lomba tidak ditemukan.');

    const competitionId = competition.id as string;

    const participants = await tx.execute(sql`
      SELECT t.id, t.student_id AS "studentId", s.name AS "studentName", s.slug AS "studentSlug",
             s.level::text AS level,
             t.readiness_pct AS "readinessPct", t.result::text AS result,
             t.award, t.score, t.note,
             t.recorded_at AS "recordedAt",
             tm.team_id AS "teamId", tmm.name AS "teamName", tm.role::text AS "teamRole"
      FROM competition_targets t
      JOIN students s ON s.id = t.student_id
      LEFT JOIN team_members tm ON tm.student_id = t.student_id AND tm.competition_id = t.competition_id
      LEFT JOIN teams tmm ON tmm.id = tm.team_id
      WHERE t.competition_id = ${competitionId}::uuid
      ORDER BY t.readiness_pct DESC, s.name
    `);

    const teams = await tx.execute(sql`
      SELECT tm.id, tm.name, tm.note,
             tm.mentor_id AS "mentorId", u.full_name AS "mentorName",
             COALESCE(
               json_agg(
                 json_build_object(
                   'studentId', m.student_id,
                   'studentName', s.name,
                   'role', m.role::text
                 ) ORDER BY m.role, s.name
               ) FILTER (WHERE m.student_id IS NOT NULL),
               '[]'::json
             ) AS members
      FROM teams tm
      LEFT JOIN users u ON u.id = tm.mentor_id
      LEFT JOIN team_members m ON m.team_id = tm.id
      LEFT JOIN students s ON s.id = m.student_id
      WHERE tm.competition_id = ${competitionId}::uuid
      GROUP BY tm.id, u.full_name
      ORDER BY tm.name
    `);

    /**
     * The readiness distribution doc 13 §12.8 asks for.
     *
     * Bucketed in SQL rather than in the browser so every surface that draws
     * this bar draws the same four buckets. `width_bucket` would put 100 in a
     * fifth bucket of its own, which is why the boundaries are spelled out.
     */
    const distribution = await tx.execute(sql`
      SELECT
        count(*) FILTER (WHERE readiness_pct < 25)::int  AS "b0",
        count(*) FILTER (WHERE readiness_pct >= 25 AND readiness_pct < 50)::int AS "b25",
        count(*) FILTER (WHERE readiness_pct >= 50 AND readiness_pct < 75)::int AS "b50",
        count(*) FILTER (WHERE readiness_pct >= 75)::int AS "b75"
      FROM competition_targets
      WHERE competition_id = ${competitionId}::uuid
    `);

    return {
      competition,
      participants: normalise(Array.from(participants) as Record<string, unknown>[]),
      teams: Array.from(teams) as Record<string, unknown>[],
      distribution: (Array.from(distribution) as Record<string, number>[]).at(0) ?? {
        b0: 0,
        b25: 0,
        b50: 0,
        b75: 0,
      },
    };
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public reads, `asAnon`, so RLS decides what is public
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The public marketing calendar (doc 13 §5.1, "the single best organic lead
 * magnet Metroscope owns").
 *
 * `asAnon` and not a service-role read: a published-only filter written in
 * JavaScript would be a claim, while `competitions_select_public` is a check.
 * Nothing joined here touches a participant, a team or a result. Those tables
 * are not granted to `anon` at all, so a mistake in this query cannot leak a
 * child's name.
 */
export async function listPublicCompetitions(query: PublicCompetitionsInput) {
  const where: SQL[] = [sql`c.status = 'PUBLISHED'`];
  if (query.schoolLevel) where.push(sql`${query.schoolLevel} = ANY (c.levels)`);
  if (query.level) where.push(sql`c.level = ${query.level}::competition_level`);
  if (!query.includeClosed) where.push(sql`c.registration_deadline >= now()`);

  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${COMPETITION_COLUMNS}, m.storage_key AS "coverKey", m.alt AS "coverAlt"
      FROM competitions c
      LEFT JOIN media_assets m ON m.id = c.cover_id
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY c.registration_deadline
      LIMIT ${query.limit}
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

/**
 * The SEO override row is LEFT JOINed, not required.
 *
 * Most competitions never get one, and the page falls back to the name and the
 * summary. `noindex` is carried through so an editor who marks a lomba
 * "jangan diindeks" gets that answer from the page as well as from the
 * sitemap, the sitemap already honours it, and a page that says the opposite
 * to the same crawler is worse than neither.
 */
export async function getPublicCompetition(slug: string) {
  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${COMPETITION_COLUMNS}, m.storage_key AS "coverKey", m.alt AS "coverAlt",
             s.title AS "seoTitle", s.description AS "seoDescription",
             s.canonical AS "seoCanonical", COALESCE(s.noindex, false) AS "seoNoindex",
             s.og_image_key AS "seoOgImageKey"
      FROM competitions c
      LEFT JOIN media_assets m ON m.id = c.cover_id
      LEFT JOIN seo_meta s ON s.entity_type = 'competition' AND s.entity_id = c.id
      WHERE c.slug = ${slug} AND c.status = 'PUBLISHED'
    `);
    const row = normalise(Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Lomba tidak ditemukan.');
    return row;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Writes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the row. The pipeline does everything after this.
 *
 * DRAFT by construction, `competitions_write`'s WITH CHECK would refuse
 * anything else from an author without a publish verb, and the INSERT does not
 * name `status` at all so there is nothing to refuse.
 */
export async function createCompetition(ctx: RequestContext, input: CreateCompetitionInput) {
  const slug = input.slug ?? slugify(input.name);

  const created = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; slug: string }>(sql`
      INSERT INTO competitions (slug, name, registration_deadline, level, format, mode, levels, created_by_id)
      VALUES (${slug}, ${input.name}, ${input.registrationDeadline.toISOString()}::timestamptz,
              ${input.level}::competition_level, ${input.format}::competition_format,
              ${input.mode}::competition_mode, ${textArray(input.levels)},
              ${ctx.user!.id}::uuid)
      RETURNING id, slug
    `);
    const row = (Array.from(rows) as { id: string; slug: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat lomba.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'competition',
    entityId: created.id,
    after: { name: input.name, slug: created.slug },
  });
  return { id: created.id, slug: created.slug, status: 'DRAFT' as const };
}

/** Enter a student. `student.edit`, roster work (doc 13 §8.3, Secretary). */
export async function addTarget(ctx: RequestContext, competitionId: string, input: AddTargetInput) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO competition_targets (competition_id, student_id, note, added_by_id)
      VALUES (${competitionId}::uuid, ${input.studentId}::uuid, ${input.note ?? null},
              ${ctx.user!.id}::uuid)
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mendaftarkan siswa.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.target.add',
    entity: 'competition_target',
    entityId: created.id,
    after: { competitionId, studentId: input.studentId },
  });
  return { id: created.id };
}

/**
 * Readiness and result. `progress.edit`, a mentor's statement about what
 * happened (doc 13 §8.3, "record competition result").
 *
 * `recorded_by_id` / `recorded_at` are stamped only when the RESULT moves, not
 * on every readiness nudge. A certificate arriving three weeks late should not
 * make it look like nobody touched the record since; and a readiness slider
 * dragged twice a week should not overwrite who decided the outcome.
 */
export async function updateTarget(
  ctx: RequestContext,
  competitionId: string,
  targetId: string,
  input: UpdateTargetInput,
) {
  const assignments: SQL[] = [];
  if (input.readinessPct !== undefined) {
    assignments.push(sql`readiness_pct = ${input.readinessPct}`);
  }
  if (input.result !== undefined) {
    assignments.push(sql`result = ${input.result}::competition_result`);
    assignments.push(sql`recorded_by_id = ${ctx.user!.id}::uuid`);
    assignments.push(sql`recorded_at = now()`);
  }
  if (input.award !== undefined) assignments.push(sql`award = ${input.award}`);
  if (input.score !== undefined) assignments.push(sql`score = ${input.score}`);
  if (input.certificateId !== undefined) {
    assignments.push(sql`certificate_id = ${input.certificateId}::uuid`);
  }
  if (input.note !== undefined) assignments.push(sql`note = ${input.note}`);
  assignments.push(sql`updated_at = now()`);

  const updated = await asUser(ctx, async (tx) => {
    const before = await tx.execute(sql`
      SELECT result::text AS result, readiness_pct AS "readinessPct"
      FROM competition_targets
      WHERE id = ${targetId}::uuid AND competition_id = ${competitionId}::uuid
    `);
    const prior = (Array.from(before) as Record<string, unknown>[]).at(0);
    if (!prior) throw new ApiError(404, 'NOT_FOUND', 'Peserta tidak ditemukan.');

    const rows = await tx.execute(sql`
      UPDATE competition_targets
      SET ${sql.join(assignments, sql`, `)}
      WHERE id = ${targetId}::uuid AND competition_id = ${competitionId}::uuid
      RETURNING id, student_id AS "studentId", readiness_pct AS "readinessPct",
                result::text AS result, award
    `);
    const row = (Array.from(rows) as Record<string, unknown>[]).at(0);
    /**
     * The row was visible a statement ago, so an empty RETURNING here is the
     * UPDATE policy refusing, the read is open to anyone holding
     * `/competitions`, the write needs `progress.edit`.
     */
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mencatat hasil lomba.');
    return { prior, row };
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.target.update',
    entity: 'competition_target',
    entityId: targetId,
    before: updated.prior,
    after: updated.row,
  });
  return updated.row;
}

export async function removeTarget(ctx: RequestContext, competitionId: string, targetId: string) {
  const removed = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; studentId: string }>(sql`
      DELETE FROM competition_targets
      WHERE id = ${targetId}::uuid AND competition_id = ${competitionId}::uuid
      RETURNING id, student_id AS "studentId"
    `);
    const row = (Array.from(rows) as { id: string; studentId: string }[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Peserta tidak ditemukan.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.target.remove',
    entity: 'competition_target',
    entityId: targetId,
    before: { competitionId, studentId: removed.studentId },
  });
  return { id: removed.id };
}

export async function createTeam(
  ctx: RequestContext,
  competitionId: string,
  input: CreateTeamInput,
) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO teams (competition_id, name, mentor_id, note)
      VALUES (${competitionId}::uuid, ${input.name}, ${input.mentorId ?? null}::uuid,
              ${input.note ?? null})
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat tim.');
    return row;
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.team.create',
    entity: 'team',
    entityId: created.id,
    after: { competitionId, name: input.name },
  });
  return { id: created.id };
}

export async function deleteTeam(ctx: RequestContext, competitionId: string, teamId: string) {
  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      DELETE FROM teams
      WHERE id = ${teamId}::uuid AND competition_id = ${competitionId}::uuid
      RETURNING id
    `);
    if (!(Array.from(rows) as { id: string }[]).at(0)) {
      throw new ApiError(404, 'NOT_FOUND', 'Tim tidak ditemukan.');
    }
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.team.delete',
    entity: 'team',
    entityId: teamId,
    before: { competitionId },
  });
  return { id: teamId };
}

/**
 * Put a student in a team.
 *
 * `competition_id` is written from the TEAM rather than from the request, so
 * the two composite foreign keys in migration 0023 have something consistent to
 * check: a caller cannot claim a member belongs to a competition their team
 * does not belong to.
 */
export async function addTeamMember(
  ctx: RequestContext,
  competitionId: string,
  teamId: string,
  input: AddTeamMemberInput,
) {
  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ studentId: string }>(sql`
      INSERT INTO team_members (team_id, competition_id, student_id, role)
      SELECT t.id, t.competition_id, ${input.studentId}::uuid, ${input.role}::team_role
      FROM teams t
      WHERE t.id = ${teamId}::uuid AND t.competition_id = ${competitionId}::uuid
      RETURNING student_id AS "studentId"
    `);
    if (!(Array.from(rows) as { studentId: string }[]).at(0)) {
      throw new ApiError(404, 'NOT_FOUND', 'Tim tidak ditemukan.');
    }
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.team.member.add',
    entity: 'team',
    entityId: teamId,
    after: { studentId: input.studentId, role: input.role },
  });
  return { teamId, studentId: input.studentId };
}

export async function removeTeamMember(
  ctx: RequestContext,
  competitionId: string,
  teamId: string,
  studentId: string,
) {
  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ studentId: string }>(sql`
      DELETE FROM team_members
      WHERE team_id = ${teamId}::uuid
        AND competition_id = ${competitionId}::uuid
        AND student_id = ${studentId}::uuid
      RETURNING student_id AS "studentId"
    `);
    if (!(Array.from(rows) as { studentId: string }[]).at(0)) {
      throw new ApiError(404, 'NOT_FOUND', 'Anggota tim tidak ditemukan.');
    }
  }).catch(rethrow);

  await writeAuditLog({
    ctx,
    action: 'competition.team.member.remove',
    entity: 'team',
    entityId: teamId,
    before: { studentId },
  });
  return { teamId, studentId };
}
