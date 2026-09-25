import { sql } from 'drizzle-orm';
import type { RequestContext } from '@/lib/auth/context';
import { asUser, withElevatedPrivileges } from '@/lib/db/rls';
import type { CreateLeadInput, ListLeadsQueryInput } from './leads.schema';

/**
 * Data access only. No business rules here. Those belong to the service, so
 * they remain testable without a database.
 *
 * Note which reads run as the caller (RLS active) and which must elevate.
 */
/** Index signature required by drizzle's `execute<T>` row constraint. */
export interface LeadRow extends Record<string, unknown> {
  id: string;
  childName: string;
  parentName: string | null;
  parentPhone: string;
  level: string;
  type: string;
  status: string;
  programName: string | null;
  source: string;
  followUpAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}

/**
 * Staff read. Runs AS the caller. RLS decides which rows are visible.
 *
 * Ordered newest first and paged by a `(created_at, id)` keyset rather than
 * OFFSET: a lead arriving mid-scroll shifts every offset by one, which shows a
 * duplicate row and hides a real one. `id` breaks ties so the order is total.
 */
export async function findLeads(ctx: RequestContext, q: ListLeadsQueryInput): Promise<LeadRow[]> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<LeadRow>(sql`
      SELECT r.id,
             r.child_name        AS "childName",
             r.parent_name       AS "parentName",
             r.parent_phone      AS "parentPhone",
             r.level,
             r.type,
             r.status,
             p.name              AS "programName",
             r.source,
             r.follow_up_at      AS "followUpAt",
             r.last_contacted_at AS "lastContactedAt",
             r.created_at        AS "createdAt"
      FROM registrations r
      LEFT JOIN programs p ON p.id = r.program_id
      WHERE (${q.status ?? null}::text IS NULL OR r.status = ${q.status ?? null})
        AND (${q.source ?? null}::text IS NULL OR r.source = ${q.source ?? null})
        AND (
          ${q.q ?? null}::text IS NULL
          OR r.child_name ILIKE '%' || ${q.q ?? null} || '%'
          OR r.parent_name ILIKE '%' || ${q.q ?? null} || '%'
          OR r.parent_phone ILIKE '%' || ${q.q ?? null} || '%'
        )
        -- The follow-up queue: everything due on or before the given moment.
        -- ISO text with an explicit cast, for the same reason as setFollowUp:
        -- an untyped Date parameter leaves Postgres guessing, and it guesses
        -- wrong in a way that silently matches nothing.
        AND (
          ${q.dueBefore?.toISOString() ?? null}::timestamptz IS NULL
          OR (
            r.follow_up_at IS NOT NULL
            AND r.follow_up_at <= ${q.dueBefore?.toISOString() ?? null}::timestamptz
          )
        )
        AND (
          ${q.cursor ?? null}::uuid IS NULL
          OR (r.created_at, r.id) <
             (SELECT c.created_at, c.id FROM registrations c WHERE c.id = ${q.cursor ?? null})
        )
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${q.limit}
    `);
    return Array.from(rows) as LeadRow[];
  });
}

/** Pipeline counts for the /leads tabs and the sidebar badge. */
export async function countByStatus(ctx: RequestContext): Promise<Record<string, number>> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ status: string; n: number }>(sql`
      SELECT status, count(*)::int AS n FROM registrations GROUP BY status
    `);
    return Object.fromEntries(
      (Array.from(rows) as { status: string; n: number }[]).map((r) => [r.status, Number(r.n)]),
    );
  });
}

/**
 * Public submission has no session, so there is no caller identity to run as.
 * This is one of the enumerated privileged operations, and it is audited.
 */
export async function findDuplicate(
  ctx: RequestContext,
  phone: string,
  email?: string,
): Promise<{ id: string } | null> {
  return withElevatedPrivileges(
    ctx,
    'user.provision',
    'dedupe check on public registration submit',
    async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        SELECT id FROM registrations
        WHERE parent_phone = ${phone}
           OR (${email ?? null}::text IS NOT NULL AND parent_email = ${email ?? null})
        ORDER BY created_at DESC
        LIMIT 1
      `);
      return (Array.from(rows) as { id: string }[]).at(0) ?? null;
    },
  );
}

export async function insertLead(
  ctx: RequestContext,
  input: CreateLeadInput,
): Promise<{ id: string }> {
  return withElevatedPrivileges(ctx, 'user.provision', 'public registration submit', async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
        INSERT INTO registrations
          (child_name, parent_phone, parent_email, parent_name, school, dob, level,
           program_id, preferred_slot, type,
           source, medium, campaign, referrer, landing_page, status)
        VALUES (${input.childName}, ${input.parentPhone}, ${input.parentEmail},
                ${input.parentName ?? null}, ${input.school ?? null},
                ${input.dob ?? null}::date, ${input.level},
                ${input.programId}, ${input.preferredSlot ?? null}, ${input.type},
                ${input.source}, ${input.medium ?? null}, ${input.campaign ?? null},
                ${input.referrer ?? null}, ${input.landingPage ?? null}, 'NEW')
        RETURNING id
      `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new Error('insertLead returned no row');
    return row;
  });
}

export interface LeadDetail extends Record<string, unknown> {
  id: string;
  childName: string;
  parentName: string | null;
  parentPhone: string;
  parentEmail: string | null;
  school: string | null;
  level: string;
  type: string;
  status: string;
  programId: string | null;
  programName: string | null;
  source: string;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landingPage: string | null;
  consultationOutcome: string | null;
  lossReason: string | null;
  followUpNote: string | null;
  followUpAt: string | null;
  lastContactedAt: string | null;
  rejectionReason: string | null;
  convertedStudentId: string | null;
  createdAt: string;
}

/** One lead, as the caller. RLS returns nothing if they lack the /leads grant. */
export async function findLeadById(ctx: RequestContext, id: string): Promise<LeadDetail | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<LeadDetail>(sql`
      SELECT r.id,
             r.child_name           AS "childName",
             r.parent_name          AS "parentName",
             r.parent_phone         AS "parentPhone",
             r.parent_email         AS "parentEmail",
             r.school,
             r.level,
             r.type,
             r.status,
             r.program_id           AS "programId",
             p.name                 AS "programName",
             r.source,
             r.medium,
             r.campaign,
             r.referrer,
             r.landing_page         AS "landingPage",
             r.consultation_outcome AS "consultationOutcome",
             r.loss_reason          AS "lossReason",
             r.follow_up_note       AS "followUpNote",
             r.follow_up_at         AS "followUpAt",
             r.last_contacted_at    AS "lastContactedAt",
             r.rejection_reason     AS "rejectionReason",
             r.converted_student_id AS "convertedStudentId",
             r.created_at           AS "createdAt"
      FROM registrations r
      LEFT JOIN programs p ON p.id = r.program_id
      WHERE r.id = ${id}
    `);
    return (Array.from(rows) as LeadDetail[]).at(0) ?? null;
  });
}

export interface ContactRow extends Record<string, unknown> {
  id: string;
  note: string;
  actorName: string | null;
  createdAt: string;
}

export async function findContacts(ctx: RequestContext, leadId: string): Promise<ContactRow[]> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<ContactRow>(sql`
      SELECT c.id,
             c.note,
             u.full_name  AS "actorName",
             c.created_at AS "createdAt"
      FROM registration_contacts c
      LEFT JOIN users u ON u.id = c.actor_id
      WHERE c.registration_id = ${leadId}
      ORDER BY c.created_at DESC
    `);
    return Array.from(rows) as ContactRow[];
  });
}

/**
 * Move a lead's status. Returns null when RLS or the guard below matched no row,
 * which the service turns into a 404 rather than a silent success.
 *
 * The `converted_student_id IS NULL` guard is the important part: a converted
 * lead has a student, an enrolment and an invoice hanging off it, and dragging
 * it back to NURTURING would orphan all three.
 */
export async function updateStatus(
  ctx: RequestContext,
  id: string,
  status: string,
  reason: string | null,
  followUpAt: Date | null,
): Promise<{ id: string; status: string } | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; status: string }>(sql`
      UPDATE registrations
      SET status            = ${status},
          rejection_reason  = COALESCE(${reason}, rejection_reason),
          follow_up_at      = COALESCE(${followUpAt?.toISOString() ?? null}::timestamptz, follow_up_at),
          last_contacted_at = now()
      WHERE id = ${id}
        AND converted_student_id IS NULL
      RETURNING id, status
    `);
    return (Array.from(rows) as { id: string; status: string }[]).at(0) ?? null;
  });
}

/**
 * Record how a consultation ended.
 *
 * The status follows from the outcome rather than being passed in. LANJUT means
 * the lead is ready to convert, PIKIR_DULU means nurture, TIDAK_COCOK means lost.
 * Letting the caller send both invites the combination "TIDAK_COCOK but status
 * CONSULTING", which is how a pipeline stops meaning anything.
 */
export async function recordConsultationOutcome(
  ctx: RequestContext,
  id: string,
  outcome: string,
  status: string,
  lossReason: string | null,
  note: string | null,
  followUpAt: Date | null,
): Promise<{ id: string; status: string } | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; status: string }>(sql`
      UPDATE registrations
      SET consultation_outcome = ${outcome},
          status               = ${status},
          loss_reason          = ${lossReason},
          follow_up_note       = COALESCE(${note}, follow_up_note),
          follow_up_at         = ${followUpAt?.toISOString() ?? null}::timestamptz,
          last_contacted_at    = now()
      WHERE id = ${id}
        AND converted_student_id IS NULL
      RETURNING id, status
    `);
    return (Array.from(rows) as { id: string; status: string }[]).at(0) ?? null;
  });
}

/**
 * Set the next-touch date without changing pipeline status.
 *
 * Timestamps are bound as ISO text with an explicit `::timestamptz` cast rather
 * than as a JS Date. Drizzle hands a Date to the driver as an untyped parameter,
 * and inside COALESCE Postgres has to guess its type, which silently produced a
 * no-op update here. Being explicit costs nothing and removes the guess.
 */
export async function setFollowUp(
  ctx: RequestContext,
  id: string,
  followUpAt: Date | null,
): Promise<number> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE registrations
      SET follow_up_at      = COALESCE(${followUpAt?.toISOString() ?? null}::timestamptz, follow_up_at),
          last_contacted_at = now()
      WHERE id = ${id}
      RETURNING id
    `);
    return Array.from(rows).length;
  });
}

/** Staff-authored contact log entry. RLS applies. */
export async function appendNote(ctx: RequestContext, leadId: string, note: string): Promise<void> {
  if (!ctx.user) {
    // Public dedupe path: the note is attributed to the system, audited above.
    await withElevatedPrivileges(ctx, 'user.provision', 'system note on dedupe', async (tx) => {
      await tx.execute(sql`
        INSERT INTO registration_contacts (registration_id, actor_id, note)
        VALUES (${leadId}, NULL, ${note})
      `);
    });
    return;
  }

  await asUser(ctx, async (tx) => {
    await tx.execute(sql`
      INSERT INTO registration_contacts (registration_id, actor_id, note)
      VALUES (${leadId}, ${ctx.user!.id}, ${note})
    `);
  });
}
