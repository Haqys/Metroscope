import { sql } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { writeAuditLog } from '@/lib/audit';
import { enqueue } from '@/lib/queue';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type {
  ApproveRescheduleInput,
  CreateRescheduleInput,
  ListRescheduleInput,
  RejectRescheduleInput,
} from './reschedule.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reschedule requests (doc 13 §12.6, doc 14 §3.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "The parent submits into a void" is the defect doc 13 names. What closes it
 * is not this file. It is the `/inbox` source in `inbox.service.ts`, but this
 * is where the request becomes a row somebody can act on.
 *
 * ## Approving links two sessions; it does not edit one
 *
 * doc 06 models the outcome as original → `newSessionId`, and that shape is
 * kept deliberately. An UPDATE to `starts_at` would be three fewer lines and
 * would erase the fact that the lesson moved, which is the exact question a
 * parent asks later ("kami sudah minta pindah, kok tercatat bolos?"), and the
 * distinction a mentor-fee report has to make between a lesson that did not
 * happen and one that happened on another day.
 */

const REQUEST_COLUMNS = sql`
  r.id, r.session_id AS "sessionId", r.status::text AS status,
  r.reason, r.note, r.preferred_starts_at AS "preferredStartsAt",
  r.decided_at AS "decidedAt", r.decision_note AS "decisionNote",
  r.new_session_id AS "newSessionId", r.created_at AS "createdAt",
  s.starts_at AS "sessionStartsAt", s.ends_at AS "sessionEndsAt",
  s.status::text AS "sessionStatus",
  st.name AS "studentName", st.slug AS "studentSlug",
  app.session_mentor_name(s.id) AS "mentorName",
  n.starts_at AS "newStartsAt"
`;

const REQUEST_JOINS = sql`
  FROM reschedule_requests r
  JOIN sessions s ON s.id = r.session_id
  JOIN students st ON st.id = s.student_id
  LEFT JOIN sessions n ON n.id = r.new_session_id
`;

const ISO_FIELDS = [
  'preferredStartsAt',
  'decidedAt',
  'createdAt',
  'sessionStartsAt',
  'sessionEndsAt',
  'newStartsAt',
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

function rethrowDenied(err: unknown): never {
  const driver = (err as { cause?: unknown }).cause ?? err;
  const code = (driver as { code?: string }).code;
  if (code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang melakukan tindakan ini.');
  }
  /**
   * The partial unique index on PENDING. Two open requests for one lesson would
   * be two people deciding the same question, and the second asker needs to be
   * told their first one is still waiting rather than shown a 500.
   */
  if (code === '23505') {
    throw new ApiError(
      409,
      'RESCHEDULE_PENDING',
      'Sudah ada permintaan reschedule untuk jadwal ini yang menunggu keputusan.',
    );
  }
  if (code === '23P01') {
    throw new ApiError(409, 'SESSION_CONFLICT', 'Jam pengganti bertabrakan dengan jadwal lain.');
  }
  throw err;
}

export async function listRequests(ctx: RequestContext, query: ListRescheduleInput) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${REQUEST_COLUMNS} ${REQUEST_JOINS}
      ${query.status ? sql`WHERE r.status = ${query.status}::reschedule_status` : sql``}
      ORDER BY r.created_at DESC
      LIMIT ${query.limit}
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

export async function getRequest(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${REQUEST_COLUMNS} ${REQUEST_JOINS} WHERE r.id = ${id}::uuid
    `);
    const row = normalise(Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Permintaan tidak ditemukan.');
    return row;
  });
}

/**
 * A family asks. FR-RES-1 caps it at H-1.
 *
 * The cut-off is enforced here rather than only in the wizard, because the
 * wizard is a convenience and this is the rule: a request filed an hour before
 * the lesson cannot be acted on in time, and accepting it would be the "silent
 * SLA breach" doc 13 §12.6 warns about, a promise the UI makes and the team
 * cannot keep.
 */
export async function createRequest(ctx: RequestContext, input: CreateRescheduleInput) {
  const created = await asUser(ctx, async (tx) => {
    const sessionRows = await tx.execute<{ starts_at: string; status: string }>(sql`
      SELECT starts_at, status::text AS status FROM sessions WHERE id = ${input.sessionId}::uuid
    `);
    const session = Array.from(sessionRows).at(0);
    if (!session) throw new ApiError(404, 'NOT_FOUND', 'Jadwal tidak ditemukan.');

    if (session.status !== 'SCHEDULED') {
      throw new ApiError(
        422,
        'SESSION_NOT_RESCHEDULABLE',
        'Hanya jadwal yang masih terjadwal yang bisa diajukan reschedule.',
      );
    }

    const startsAt = new Date(session.starts_at).getTime();
    if (startsAt - Date.now() < 24 * 60 * 60 * 1000) {
      throw new ApiError(
        422,
        'RESCHEDULE_TOO_LATE',
        'Reschedule hanya bisa diajukan paling lambat H-1 sebelum jadwal.',
      );
    }

    const rows = await tx
      .execute<{ id: string }>(
        sql`
        INSERT INTO reschedule_requests (session_id, requested_by_id, reason, note,
                                         preferred_starts_at)
        VALUES (${input.sessionId}::uuid, ${ctx.user!.id}::uuid, ${input.reason},
                ${input.note ?? null}, ${input.preferredStartsAt ?? null}::timestamptz)
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengajukan reschedule.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'session.reschedule-requested',
    entity: 'reschedule_request',
    entityId: created.id,
    after: { ...input },
  });

  return getRequest(ctx, created.id);
}

/**
 * Approve: cancel the original as RESCHEDULED, create the replacement, link them.
 *
 * The order is not incidental. The original is retired FIRST, because the
 * overlap constraints are scoped to SCHEDULED and DONE, moving a lesson from
 * 16.00 to 16.30 overlaps itself, and inserting the replacement first would be
 * refused by the very guard that exists to stop double-booking.
 *
 * All of it in one transaction: a replacement with no cancellation is a
 * double-booked mentor, and a cancellation with no replacement is a child with
 * no lesson.
 */
export async function approveRequest(
  ctx: RequestContext,
  id: string,
  input: ApproveRescheduleInput,
) {
  const result = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{
      session_id: string;
      status: string;
      student_id: string;
      mentor_id: string;
      program_id: string | null;
      type: string;
      duration_min: number;
    }>(sql`
      SELECT r.session_id, r.status::text AS status,
             s.student_id, s.mentor_id, s.program_id, s.type::text AS type,
             (EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 60)::int AS duration_min
      FROM reschedule_requests r
      JOIN sessions s ON s.id = r.session_id
      WHERE r.id = ${id}::uuid
      FOR UPDATE OF r
    `);
    const request = Array.from(rows).at(0);
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'Permintaan tidak ditemukan.');
    if (request.status !== 'PENDING') {
      throw new ApiError(409, 'ALREADY_DECIDED', 'Permintaan ini sudah diputuskan.');
    }

    /** Retire the original first, see above. */
    await tx
      .execute(
        sql`
        UPDATE sessions
        SET status = 'RESCHEDULED', cancel_reason = 'Dijadwalkan ulang atas permintaan keluarga',
            updated_at = now()
        WHERE id = ${request.session_id}::uuid
      `,
      )
      .catch(rethrowDenied);

    const minutes = input.durationMin ?? request.duration_min;
    const replacement = await tx
      .execute<{ id: string }>(
        sql`
        INSERT INTO sessions (student_id, mentor_id, program_id, type, starts_at, ends_at, note)
        VALUES (${request.student_id}::uuid,
                ${input.mentorId ?? request.mentor_id}::uuid,
                ${request.program_id}::uuid,
                ${request.type}::session_type,
                ${input.startsAt}::timestamptz,
                ${input.startsAt}::timestamptz + make_interval(mins => ${minutes}),
                ${input.note ?? null})
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    const newSession = Array.from(replacement).at(0);
    if (!newSession) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat jadwal.');

    await tx.execute(sql`
      UPDATE reschedule_requests
      SET status = 'APPROVED', decided_by_id = ${ctx.user!.id}::uuid, decided_at = now(),
          decision_note = ${input.note ?? null}, new_session_id = ${newSession.id}::uuid,
          updated_at = now()
      WHERE id = ${id}::uuid
    `);

    return { newSessionId: newSession.id, originalId: request.session_id };
  });

  await writeAuditLog({
    ctx,
    action: 'session.reschedule-approved',
    entity: 'reschedule_request',
    entityId: id,
    after: { ...input, ...result },
  });

  /** After commit, best effort, the decision is durable either way. */
  await enqueue('notification.reschedule-decided', { requestId: id });

  return getRequest(ctx, id);
}

export async function rejectRequest(ctx: RequestContext, id: string, input: RejectRescheduleInput) {
  await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`
        UPDATE reschedule_requests
        SET status = 'REJECTED', decided_by_id = ${ctx.user!.id}::uuid, decided_at = now(),
            decision_note = ${input.note}, updated_at = now()
        WHERE id = ${id}::uuid AND status = 'PENDING'
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    if (Array.from(rows).length === 0) {
      const existing = await tx.execute<{ status: string }>(
        sql`SELECT status::text AS status FROM reschedule_requests WHERE id = ${id}::uuid`,
      );
      const found = Array.from(existing).at(0);
      if (!found) throw new ApiError(404, 'NOT_FOUND', 'Permintaan tidak ditemukan.');
      throw new ApiError(409, 'ALREADY_DECIDED', 'Permintaan ini sudah diputuskan.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'session.reschedule-rejected',
    entity: 'reschedule_request',
    entityId: id,
    after: { ...input },
  });

  await enqueue('notification.reschedule-decided', { requestId: id });
  return getRequest(ctx, id);
}

/**
 * The family takes the question back.
 *
 * Not a decision about the schedule, which is why the policy lets the requester
 * do it without `session.manage`, and why this is the only status transition
 * that path may make. A guardian holding the UPDATE grant on their own row
 * could otherwise write APPROVED directly; the `status = 'PENDING'` guard plus
 * the literal below is what stops that, not the caller's good manners.
 */
export async function withdrawRequest(ctx: RequestContext, id: string) {
  await asUser(ctx, async (tx) => {
    const rows = await tx
      .execute<{ id: string }>(
        sql`
        UPDATE reschedule_requests
        SET status = 'WITHDRAWN', updated_at = now()
        WHERE id = ${id}::uuid
          AND status = 'PENDING'
          AND requested_by_id = ${ctx.user!.id}::uuid
        RETURNING id
      `,
      )
      .catch(rethrowDenied);

    if (Array.from(rows).length === 0) {
      throw new ApiError(
        409,
        'CANNOT_WITHDRAW',
        'Hanya permintaan sendiri yang masih menunggu yang bisa dibatalkan.',
      );
    }
  });

  await writeAuditLog({
    ctx,
    action: 'session.reschedule-withdrawn',
    entity: 'reschedule_request',
    entityId: id,
  });

  return getRequest(ctx, id);
}
