import { sql, type SQL } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { db } from '@/lib/db/client';
import { toIso } from '@/lib/db/iso';
import { sessionCalendarLink } from './calendar-link';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { calendarConfigured } from '@/lib/google/credentials';
import type { RequestContext } from '@/lib/auth/context';
import type {
  CancelSessionInput,
  ConflictInput,
  CreateSeriesInput,
  CreateSessionInput,
  EndSeriesInput,
  ListSessionsInput,
  MarkAttendanceInput,
  SetAvailabilityInput,
  UpdateSeriesInput,
  UpdateSessionInput,
} from './scheduling.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Scheduling (doc 06 §2.3, doc 13 §12.6, doc 14 §3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every query runs as the caller (`asUser`), so `95_scheduling.sql` decides who
 * sees whose lessons. There is no ownership check in this file and there must
 * not be: a JS-side "is this the parent's child" would be a second copy of
 * `app.owns_student()`, and the copy that drifts is the one that shows a family
 * another family's timetable.
 *
 * ## The zone problem, stated once
 *
 * A series stores "Rabu 16.00", a promise about the clock on the wall in
 * Denpasar. A session stores an instant. The two meet in exactly one place,
 * `AT TIME ZONE 'Asia/Makassar'` in `seriesOccurrences()`, and nowhere else.
 * Doing the conversion in JS would put a second answer in the codebase, and the
 * two disagree the moment anything runs on a machine that is not WITA, which
 * is every machine this deploys to (doc 08: Vercel, UTC).
 */

/** WITA. CLAUDE.md: store UTC, render WITA. This is where "render" begins. */
const ZONE = 'Asia/Makassar';

type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

/**
 * The overlap constraints are the source of truth about double-booking, so a
 * violation is an expected outcome, not a crash.
 *
 * Postgres raises 23P01 (`exclusion_violation`) and names the constraint, which
 * is the difference between "that mentor is busy" and "that child is busy",
 * two messages a Secretary acts on differently.
 */
function rethrowConflict(err: unknown): never {
  /**
   * Drizzle wraps driver errors, so `err.code` is undefined on the thing it
   * throws and the postgres error is one level down in `cause`. Reading only
   * the outer object turned every double-booking into a 500, the constraint
   * did its job and the caller was told the server had broken.
   */
  const driver = (err as { cause?: unknown }).cause ?? err;
  const code = (driver as { code?: string }).code;
  const constraint = (driver as { constraint_name?: string }).constraint_name ?? '';

  if (code === '23P01') {
    const who = constraint.includes('student') ? 'Siswa' : 'Mentor';
    throw new ApiError(
      409,
      'SESSION_CONFLICT',
      `${who} sudah punya jadwal lain yang bertabrakan dengan jam ini.`,
      { constraint },
    );
  }
  throw err;
}

/**
 * An RLS write refusal is a 403, not a 500.
 *
 * Postgres raises 42501 (`insufficient_privilege`) when a WITH CHECK fails.
 * Unwrapped it reaches the handler as an unknown error and the caller is told
 * the server broke, which is what a mentor marking somebody else's lesson saw.
 */
function rethrowDenied(err: unknown): never {
  const driver = (err as { cause?: unknown }).cause ?? err;
  if ((driver as { code?: string }).code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang melakukan tindakan ini.');
  }
  throw err;
}

const SESSION_COLUMNS = sql`
  s.id, s.series_id AS "seriesId", s.student_id AS "studentId",
  s.mentor_id AS "mentorId", s.program_id AS "programId",
  s.type::text AS type, s.status::text AS status,
  s.starts_at AS "startsAt", s.ends_at AS "endsAt",
  s.meet_url AS "meetUrl", s.note, s.cancel_reason AS "cancelReason",
  -- Sync STATE, not the event id: which calendar row an event sits in is
  -- operational detail a parent has no use for, and gcal_sync_error holds a
  -- category rather than Google's prose precisely so it can be shown to staff.
  s.gcal_sync_status::text AS "calendarSyncStatus",
  s.gcal_synced_at AS "calendarSyncedAt",
  st.name AS "studentName", st.slug AS "studentSlug",
  -- Not a join onto users: that table is closed to guardians, so the LEFT JOIN
  -- returned NULL and a parent timetable showed a blank Mentor column. The
  -- helper is scoped to sessions the caller may already read.
  app.session_mentor_name(s.id) AS "mentorName",
  p.name AS "programName",
  a.status::text AS "attendanceStatus", a.note AS "attendanceNote",
  a.marked_at AS "attendanceMarkedAt"
`;

const SESSION_JOINS = sql`
  FROM sessions s
  JOIN students st ON st.id = s.student_id
  LEFT JOIN programs p ON p.id = s.program_id
  LEFT JOIN session_attendance a ON a.session_id = s.id
`;

const ISO_FIELDS = ['startsAt', 'endsAt', 'attendanceMarkedAt', 'calendarSyncedAt'] as const;

function normalise<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const field of ISO_FIELDS) {
      const value = toIso(out[field]);
      if (value) out[field] = value;
    }

    /**
     * "Add to Google Calendar", computed from the row rather than assembled in
     * four frontends (§13). Every surface that renders a lesson gets the same
     * title and description as the server-side event, so a family cannot tell
     * which route an event took, and the portal, the mentor app and the
     * internal dashboard cannot drift apart on the format.
     *
     * Derived, never stored: the link is a pure function of the lesson, and a
     * stored copy is one more thing to forget to update on a reschedule.
     */
    if (out.startsAt && out.endsAt) {
      out.addToCalendarUrl = sessionCalendarLink({
        type: String(out.type ?? 'LESSON'),
        startsAt: String(out.startsAt),
        endsAt: String(out.endsAt),
        studentName: (out.studentName as string) ?? null,
        mentorName: (out.mentorName as string) ?? null,
        programName: (out.programName as string) ?? null,
        meetUrl: (out.meetUrl as string) ?? null,
        note: (out.note as string) ?? null,
      });
    }
    return out;
  });
}

export async function listSessions(ctx: RequestContext, query: ListSessionsInput) {
  const where: SQL[] = [sql`TRUE`];

  if (query.from) where.push(sql`s.starts_at >= ${query.from}::timestamptz`);
  if (query.to) where.push(sql`s.starts_at < ${query.to}::timestamptz`);
  if (query.studentId) where.push(sql`s.student_id = ${query.studentId}::uuid`);
  if (query.mentorId) where.push(sql`s.mentor_id = ${query.mentorId}::uuid`);
  if (query.seriesId) where.push(sql`s.series_id = ${query.seriesId}::uuid`);
  if (query.status) where.push(sql`s.status = ${query.status}::session_status`);

  /**
   * Lessons that are not happening are hidden unless asked for. They are not
   * deleted, `95_scheduling.sql` explains why, but a calendar showing every
   * lesson that did not happen is a calendar nobody can read at a glance.
   *
   * RESCHEDULED belongs in that set with CANCELLED, and was missed when §3.2
   * introduced it: a parent whose Friday moved to Tuesday saw BOTH on their
   * calendar, which reads as two lessons rather than one that moved. The
   * replacement is the lesson now; the original is history, and history is what
   * `includeCancelled` is for.
   */
  if (!query.status && !query.includeCancelled) {
    where.push(sql`s.status NOT IN ('CANCELLED', 'RESCHEDULED')`);
  }

  if (query.scope === 'mine') {
    if (!ctx.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sesi tidak ditemukan.');
    where.push(sql`s.mentor_id = ${ctx.user.id}::uuid`);
  }

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${SESSION_COLUMNS} ${SESSION_JOINS}
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY s.starts_at, st.name
      LIMIT ${query.limit}
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

export async function getSession(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${SESSION_COLUMNS} ${SESSION_JOINS} WHERE s.id = ${id}::uuid
    `);
    const row = normalise(Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Jadwal tidak ditemukan.');
    return row;
  });
}

/**
 * Hand the lesson to the calendar worker (doc 07 §6).
 *
 * Queued, never awaited inline against Google. A scheduling request must not
 * fail, or hang for fifteen seconds, because Google is slow, and doc 04
 * constraint 5 forbids doing slow third-party work inside the request anyway.
 * The session is already committed by the time this runs; the worst case is an
 * event that appears a minute late.
 *
 * The row is marked PENDING first so `/schedule` can say "menunggu sinkron"
 * truthfully in the gap between the write and the worker.
 *
 * Failing to enqueue must not fail the schedule either, the lesson is real
 * whether or not Google ever hears about it (§18).
 */
async function queueCalendarSync(sessionId: string, topic: 'calendar.sync' | 'calendar.cancel') {
  if (!calendarConfigured()) return;
  try {
    if (topic === 'calendar.sync') {
      await db.execute(sql`
        UPDATE sessions SET gcal_sync_status = COALESCE(gcal_sync_status, 'PENDING')
        WHERE id = ${sessionId}::uuid AND gcal_sync_status IS DISTINCT FROM 'SYNCED'
      `);
    }
    await enqueue(topic, { sessionId });
  } catch (err) {
    logger.error('calendar_enqueue_failed', {
      sessionId,
      topic,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

export async function createSession(ctx: RequestContext, input: CreateSessionInput) {
  const row = await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`
        INSERT INTO sessions (student_id, mentor_id, program_id, type, starts_at, ends_at,
                              meet_url, note)
        VALUES (${input.studentId}::uuid, ${input.mentorId}::uuid,
                ${input.programId ?? null}::uuid, ${input.type}::session_type,
                ${input.startsAt}::timestamptz,
                ${input.startsAt}::timestamptz + make_interval(mins => ${input.durationMin}),
                ${input.meetUrl ?? null}, ${input.note ?? null})
        RETURNING id
      `,
      )
      .catch(rethrowConflict)
      .catch(rethrowDenied);

    const created = Array.from(rows).at(0);
    /**
     * RLS refuses a WRITE by RAISING 42501. It is reads it filters to nothing.
     * `rethrowDenied` above is what turns that into a 403; this is the belt to
     * its braces, and to the route's own `session.manage` gate.
     */
    if (!created) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat jadwal.');
    return created;
  });

  await writeAuditLog({
    ctx,
    action: 'session.create',
    entity: 'session',
    entityId: row.id,
    after: { ...input },
  });
  await queueCalendarSync(row.id, 'calendar.sync');
  return getSession(ctx, row.id);
}

export async function updateSession(ctx: RequestContext, id: string, input: UpdateSessionInput) {
  const before = await getSession(ctx, id);

  await asUser(ctx, async (tx) => {
    const sets: SQL[] = [sql`updated_at = now()`];
    if (input.mentorId) sets.push(sql`mentor_id = ${input.mentorId}::uuid`);
    if (input.type) sets.push(sql`type = ${input.type}::session_type`);
    if (input.meetUrl !== undefined) sets.push(sql`meet_url = ${input.meetUrl}`);
    if (input.note !== undefined) sets.push(sql`note = ${input.note}`);

    /**
     * Moving the start moves the end with it, keeping the length unless the
     * caller said otherwise. A form that let you change the start and silently
     * kept the old end would shorten the lesson by however far it moved.
     */
    if (input.startsAt || input.durationMin) {
      const startsAt = input.startsAt ? sql`${input.startsAt}::timestamptz` : sql`starts_at`;
      const minutes = input.durationMin
        ? sql`${input.durationMin}`
        : sql`(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)::int`;
      sets.push(sql`starts_at = ${startsAt}`);
      sets.push(sql`ends_at = ${startsAt} + make_interval(mins => ${minutes})`);
    }

    const rows = await tx
      .execute<{ id: string }>(
        sql`UPDATE sessions SET ${sql.join(sets, sql`, `)} WHERE id = ${id}::uuid RETURNING id`,
      )
      .catch(rethrowConflict);

    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah jadwal ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'session.update',
    entity: 'session',
    entityId: id,
    before: { startsAt: before.startsAt, mentorId: before.mentorId },
    after: { ...input },
  });
  /** A reschedule moves the existing event; it must never make a second one (§10). */
  await queueCalendarSync(id, 'calendar.sync');
  return getSession(ctx, id);
}

export async function cancelSession(ctx: RequestContext, id: string, input: CancelSessionInput) {
  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE sessions
      SET status = 'CANCELLED', cancel_reason = ${input.reason}, updated_at = now()
      WHERE id = ${id}::uuid AND status <> 'CANCELLED'
      RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      /**
       * Either the caller may not touch it, or it was already cancelled. Both
       * leave the world in the state the caller asked for, but only one is an
       * authorisation problem, so check which before answering.
       */
      const existing = await tx.execute<{ status: string }>(
        sql`SELECT status::text AS status FROM sessions WHERE id = ${id}::uuid`,
      );
      const found = Array.from(existing).at(0);
      if (!found) throw new ApiError(404, 'NOT_FOUND', 'Jadwal tidak ditemukan.');
      if (found.status !== 'CANCELLED') {
        throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membatalkan jadwal ini.');
      }
    }
  });

  await writeAuditLog({
    ctx,
    action: 'session.cancel',
    entity: 'session',
    entityId: id,
    after: { reason: input.reason },
  });
  await queueCalendarSync(id, 'calendar.cancel');
  return getSession(ctx, id);
}

/**
 * Mark who turned up, the one write in this module a MENTOR performs.
 *
 * This writes ONE row and nothing else. Settling `sessions.status` is the job
 * of the `session_attendance_settles` trigger (migration 0020), because the
 * mentor who knows who turned up is exactly the person who does NOT hold
 * `session.manage`, an UPDATE issued from here was silently refused by RLS for
 * them, leaving every mentor-marked session showing SCHEDULED forever.
 */
export async function markAttendance(ctx: RequestContext, id: string, input: MarkAttendanceInput) {
  await asUser(ctx, async (tx) => {
    /**
     * RLS refuses an INSERT by RAISING 42501, not by returning zero rows,
     * reads are filtered, writes are rejected. Both are handled: the raise is
     * the path a mentor marking somebody else's lesson actually takes, and it
     * surfaced as a 500 until this caught it.
     */
    const rows = await tx
      .execute<{ session_id: string }>(
        sql`
        INSERT INTO session_attendance (session_id, status, note, marked_by_id, marked_at)
        VALUES (${id}::uuid, ${input.status}::attendance_status, ${input.note ?? null},
                ${ctx.user!.id}::uuid, now())
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status, note = EXCLUDED.note,
          marked_by_id = EXCLUDED.marked_by_id, marked_at = now()
        RETURNING session_id
      `,
      )
      .catch(rethrowDenied);

    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mencatat kehadiran sesi ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'session.attendance',
    entity: 'session',
    entityId: id,
    after: { ...input },
  });
  return getSession(ctx, id);
}

/**
 * The dates a weekly rule produces, as `timestamptz` instants.
 *
 * The `(7 + weekday - dow) % 7` step walks forward from `starts_on` to the
 * first matching weekday, including `starts_on` itself when it already is one,
 * which `%` gives for free and an `IF` would get wrong at the boundary.
 */
function seriesOccurrences(
  series: {
    starts_on: string;
    ends_on: string | null;
    weekday: number;
    start_time: string;
    duration_min: number;
  },
  weeks: number,
  notBefore?: string,
): SQL {
  return sql`
    WITH anchor AS (
      SELECT (${series.starts_on}::date
              + ((7 + ${series.weekday} - EXTRACT(DOW FROM ${series.starts_on}::date)::int) % 7)
             )::date AS first_day
    ),
    days AS (
      SELECT generate_series(
               (SELECT first_day FROM anchor),
               (SELECT first_day FROM anchor) + ((${weeks} - 1) * 7),
               '7 days'::interval
             )::date AS d
    )
    SELECT ((d + ${series.start_time}::time) AT TIME ZONE ${ZONE}) AS starts_at,
           ((d + ${series.start_time}::time) AT TIME ZONE ${ZONE})
             + make_interval(mins => ${series.duration_min}) AS ends_at
    FROM days
    WHERE (${series.ends_on}::date IS NULL OR d <= ${series.ends_on}::date)
      ${notBefore ? sql`AND d >= ${notBefore}::date` : sql``}
  `;
}

type SeriesRow = {
  id: string;
  student_id: string;
  mentor_id: string;
  program_id: string | null;
  weekday: number;
  start_time: string;
  duration_min: number;
  starts_on: string;
  ends_on: string | null;
};

/**
 * Materialise a rule into rows, skipping slots that are already taken.
 *
 * `ON CONFLICT DO NOTHING` cannot help here, the overlap guard is an EXCLUDE
 * constraint, not a unique index, and `ON CONFLICT` does not accept one. So the
 * generator filters against existing sessions itself and reports what it
 * skipped. That is the honest answer for a series: a term of Wednesdays where
 * one Wednesday is already a competition should produce eleven lessons and a
 * note, not fail outright and leave the parent with no timetable at all.
 */
async function materialise(
  tx: Tx,
  series: SeriesRow,
  weeks: number,
  notBefore?: string,
): Promise<{ created: number; skipped: number }> {
  const occurrences = seriesOccurrences(series, weeks, notBefore);

  const rows = await tx.execute<{ id: string }>(sql`
    WITH candidate AS (${occurrences})
    INSERT INTO sessions (series_id, student_id, mentor_id, program_id, type, starts_at, ends_at)
    SELECT ${series.id}::uuid, ${series.student_id}::uuid, ${series.mentor_id}::uuid,
           ${series.program_id}::uuid, 'LESSON'::session_type, c.starts_at, c.ends_at
    FROM candidate c
    WHERE NOT EXISTS (
      SELECT 1 FROM sessions x
      WHERE x.status IN ('SCHEDULED', 'DONE')
        AND tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(c.starts_at, c.ends_at, '[)')
        AND (x.mentor_id = ${series.mentor_id}::uuid OR x.student_id = ${series.student_id}::uuid)
    )
    RETURNING id
  `);

  const total = await tx.execute<{ n: number }>(sql`
    WITH candidate AS (${occurrences}) SELECT count(*)::int AS n FROM candidate
  `);

  const created = Array.from(rows).length;
  const expected = (Array.from(total) as { n: number }[]).at(0)?.n ?? 0;
  return { created, skipped: Math.max(0, expected - created) };
}

export async function createSeries(ctx: RequestContext, input: CreateSeriesInput) {
  const result = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<SeriesRow>(sql`
      INSERT INTO session_series (student_id, mentor_id, program_id, weekday, start_time,
                                  duration_min, starts_on, ends_on, note)
      VALUES (${input.studentId}::uuid, ${input.mentorId}::uuid, ${input.programId ?? null}::uuid,
              ${input.weekday}, ${input.startTime}::time, ${input.durationMin},
              ${input.startsOn}::date, ${input.endsOn ?? null}::date, ${input.note ?? null})
      RETURNING id, student_id, mentor_id, program_id, weekday,
                start_time::text AS start_time, duration_min,
                starts_on::text AS starts_on, ends_on::text AS ends_on
    `);
    const series = Array.from(rows).at(0);
    if (!series) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat jadwal rutin.');

    const generated = await materialise(tx, series, input.weeks).catch(rethrowConflict);
    return { id: series.id, ...generated };
  });

  await writeAuditLog({
    ctx,
    action: 'session.series.create',
    entity: 'session_series',
    entityId: result.id,
    after: { ...input, generated: result.created, skipped: result.skipped },
  });
  return result;
}

/**
 * Edit the whole series, doc 06 §7.3's "edit all".
 *
 * FUTURE sessions only, and that boundary is the entire design. A rule change
 * cannot rewrite a lesson that already happened: the mentor taught it, the
 * lesson is in a fee calculation, and the parent watched it happen at the time
 * it happened. So the past keeps its rows untouched, the future is discarded
 * and regenerated from the new rule.
 */
export async function updateSeries(ctx: RequestContext, id: string, input: UpdateSeriesInput) {
  const result = await asUser(ctx, async (tx) => {
    const sets: SQL[] = [sql`updated_at = now()`];
    if (input.mentorId) sets.push(sql`mentor_id = ${input.mentorId}::uuid`);
    if (input.weekday !== undefined) sets.push(sql`weekday = ${input.weekday}`);
    if (input.startTime) sets.push(sql`start_time = ${input.startTime}::time`);
    if (input.durationMin) sets.push(sql`duration_min = ${input.durationMin}`);
    if (input.endsOn !== undefined) sets.push(sql`ends_on = ${input.endsOn}::date`);
    if (input.note !== undefined) sets.push(sql`note = ${input.note}`);

    const rows = await tx.execute<SeriesRow>(sql`
      UPDATE session_series SET ${sql.join(sets, sql`, `)}
      WHERE id = ${id}::uuid
      RETURNING id, student_id, mentor_id, program_id, weekday,
                start_time::text AS start_time, duration_min,
                starts_on::text AS starts_on, ends_on::text AS ends_on
    `);
    const series = Array.from(rows).at(0);
    if (!series) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah jadwal rutin.');

    /**
     * Discard future SCHEDULED sessions before regenerating, or the new rule's
     * occurrences would collide with the old rule's and every one would be
     * "skipped". Deleted rather than cancelled: these are rows nobody has
     * taught, attended or been billed for, a cancellation notice for a lesson
     * that is being moved by half an hour would be noise sent to a parent.
     */
    await tx.execute(sql`
      DELETE FROM sessions
      WHERE series_id = ${id}::uuid
        AND status = 'SCHEDULED'
        AND starts_at > now()
    `);

    const today = new Date().toISOString().slice(0, 10);
    const generated = await materialise(tx, series, input.weeks, today).catch(rethrowConflict);
    return { id, ...generated };
  });

  await writeAuditLog({
    ctx,
    action: 'session.series.update',
    entity: 'session_series',
    entityId: id,
    after: { ...input, generated: result.created, skipped: result.skipped },
  });
  return result;
}

export async function endSeries(ctx: RequestContext, id: string, input: EndSeriesInput) {
  const from = input.effectiveFrom ?? new Date().toISOString().slice(0, 10);

  const cancelled = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE session_series SET status = 'ENDED', ends_on = ${from}::date, updated_at = now()
      WHERE id = ${id}::uuid RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang menghentikan jadwal rutin.');
    }

    /**
     * Cancelled, not deleted, unlike a rule EDIT above. Ending a series is a
     * decision a parent is told about ("les Rabu berhenti mulai bulan depan"),
     * and the cancelled rows with a reason are what the portal shows them.
     */
    const affected = await tx.execute<{ id: string }>(sql`
      UPDATE sessions
      SET status = 'CANCELLED', cancel_reason = ${input.reason}, updated_at = now()
      WHERE series_id = ${id}::uuid
        AND status = 'SCHEDULED'
        AND starts_at >= ${from}::date
      RETURNING id
    `);
    return Array.from(affected).length;
  });

  await writeAuditLog({
    ctx,
    action: 'session.series.end',
    entity: 'session_series',
    entityId: id,
    after: { effectiveFrom: from, reason: input.reason, cancelled },
  });
  return { id, cancelled };
}

export async function listSeries(ctx: RequestContext, studentId?: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ss.id, ss.student_id AS "studentId", ss.mentor_id AS "mentorId",
             ss.program_id AS "programId", ss.weekday,
             ss.start_time::text AS "startTime", ss.duration_min AS "durationMin",
             ss.starts_on::text AS "startsOn", ss.ends_on::text AS "endsOn",
             ss.status::text AS status, ss.note,
             st.name AS "studentName", u.full_name AS "mentorName", p.name AS "programName",
             (SELECT count(*)::int FROM sessions s
              WHERE s.series_id = ss.id AND s.status = 'SCHEDULED') AS "upcomingCount"
      FROM session_series ss
      JOIN students st ON st.id = ss.student_id
      LEFT JOIN users u ON u.id = ss.mentor_id
      LEFT JOIN programs p ON p.id = ss.program_id
      ${studentId ? sql`WHERE ss.student_id = ${studentId}::uuid` : sql``}
      ORDER BY ss.status, ss.weekday, ss.start_time
    `);
    return { items: Array.from(rows) };
  });
}

/**
 * The pre-flight the booking form runs as you pick a time.
 *
 * Two kinds of answer, and they are not the same kind of thing:
 *
 * `conflicts` are sessions that already occupy the slot. The database refuses
 * these outright (`sessions_mentor_no_overlap`), so this list exists to tell
 * somebody BEFORE they submit rather than to decide anything.
 *
 * `outsideAvailability` is a mentor teaching outside their declared week. That
 * is a preference, not an error, somebody agreed to a one-off Sunday by phone,
 * so it is returned as a warning the form shows and the user may ignore.
 */
export async function checkConflicts(ctx: RequestContext, query: ConflictInput) {
  return asUser(ctx, async (tx) => {
    /**
     * `CROSS JOIN slot` comes last, rather than `FROM sessions s, slot JOIN
     * students st ON …`. In the comma form the JOIN binds to `slot`, so its ON
     * clause cannot see `s` and Postgres rejects the statement, which made the
     * whole pre-flight a 500 while the form cheerfully reported no conflicts.
     */
    const rows = await tx.execute(sql`
      WITH slot AS (
        SELECT ${query.startsAt}::timestamptz AS starts_at,
               ${query.startsAt}::timestamptz + make_interval(mins => ${query.durationMin}) AS ends_at
      )
      SELECT s.id, s.starts_at AS "startsAt", s.ends_at AS "endsAt",
             st.name AS "studentName", u.full_name AS "mentorName",
             (s.mentor_id = ${query.mentorId}::uuid) AS "mentorClash",
             (${query.studentId ?? null}::uuid IS NOT NULL
              AND s.student_id = ${query.studentId ?? null}::uuid) AS "studentClash"
      FROM sessions s
      JOIN students st ON st.id = s.student_id
      LEFT JOIN users u ON u.id = s.mentor_id
      CROSS JOIN slot
      WHERE s.status IN ('SCHEDULED', 'DONE')
        AND (${query.excludeId ?? null}::uuid IS NULL OR s.id <> ${query.excludeId ?? null}::uuid)
        AND tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(slot.starts_at, slot.ends_at, '[)')
        AND (s.mentor_id = ${query.mentorId}::uuid
             OR (${query.studentId ?? null}::uuid IS NOT NULL
                 AND s.student_id = ${query.studentId ?? null}::uuid))
      ORDER BY s.starts_at
    `);

    /**
     * A mentor with NO declared availability is not "never available". It is a
     * template nobody has filled in, and warning on every booking would train
     * people to ignore the warning. So the check only fires when there is a
     * template to be outside of.
     */
    const availability = await tx.execute<{ has_template: boolean; covered: boolean }>(sql`
      WITH slot AS (
        SELECT (${query.startsAt}::timestamptz AT TIME ZONE ${ZONE}) AS local_start,
               ((${query.startsAt}::timestamptz + make_interval(mins => ${query.durationMin}))
                 AT TIME ZONE ${ZONE}) AS local_end
      )
      SELECT
        EXISTS (SELECT 1 FROM mentor_availability WHERE mentor_id = ${query.mentorId}::uuid)
          AS has_template,
        EXISTS (
          SELECT 1 FROM mentor_availability a, slot
          WHERE a.mentor_id = ${query.mentorId}::uuid
            AND a.weekday = EXTRACT(DOW FROM slot.local_start)::int
            AND a.start_time <= slot.local_start::time
            AND a.end_time   >= slot.local_end::time
        ) AS covered
    `);
    const av = Array.from(availability).at(0);

    return {
      conflicts: normalise(Array.from(rows) as Record<string, unknown>[]),
      outsideAvailability: Boolean(av?.has_template) && !av?.covered,
      hasAvailabilityTemplate: Boolean(av?.has_template),
    };
  });
}

export async function getAvailability(ctx: RequestContext, mentorId?: string) {
  const target = mentorId ?? ctx.user!.id;
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, mentor_id AS "mentorId", weekday,
             start_time::text AS "startTime", end_time::text AS "endTime"
      FROM mentor_availability
      WHERE mentor_id = ${target}::uuid
      ORDER BY weekday, start_time
    `);
    return { mentorId: target, items: Array.from(rows) };
  });
}

/**
 * Replace the whole weekly template in one transaction.
 *
 * Delete-then-insert rather than a diff: the editor is a week grid and the user
 * means "this is my week now". A diff would have to represent "I removed
 * Friday", which a partial payload cannot distinguish from "I did not mention
 * Friday", the same trap `saveSeo` avoids with a PUT (§2.8).
 */
export async function setAvailability(ctx: RequestContext, input: SetAvailabilityInput) {
  const target = input.mentorId ?? ctx.user!.id;

  const count = await asUser(ctx, async (tx) => {
    await tx.execute(sql`DELETE FROM mentor_availability WHERE mentor_id = ${target}::uuid`);
    if (input.slots.length === 0) return 0;

    let written = 0;
    for (const slot of input.slots) {
      const rows = await tx.execute<{ id: string }>(sql`
        INSERT INTO mentor_availability (mentor_id, weekday, start_time, end_time)
        VALUES (${target}::uuid, ${slot.weekday}, ${slot.startTime}::time, ${slot.endTime}::time)
        ON CONFLICT (mentor_id, weekday, start_time) DO UPDATE SET end_time = EXCLUDED.end_time
        RETURNING id
      `);
      written += Array.from(rows).length;
    }
    if (written === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah ketersediaan mentor ini.');
    }
    return written;
  });

  await writeAuditLog({
    ctx,
    action: 'session.availability',
    entity: 'user',
    entityId: target,
    after: { slots: input.slots.length },
  });
  return { mentorId: target, slots: count };
}
