import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { emailChannel } from '.';
import { loadTemplate, render } from './templates';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The outbox worker.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One message per invocation. Not a loop over the backlog: every unit of work
 * must fit inside a serverless invocation, and a fan-out that drains 400
 * messages times out halfway leaving the rest in PROCESSING (doc 04 constraint 5).
 * The cron sweeper re-invokes for the next one.
 *
 * Runs on the OWNER connection with no RLS. There is no caller here, a job has
 * no session, so `asUser()` has nobody to be. Everything it touches is either
 * system machinery (outbox) or written on behalf of the system (notifications).
 */

/** Backoff between attempts. Roughly 1m, 5m, 30m, 2h, 6h. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

/** A message stuck in PROCESSING this long is assumed abandoned (crash mid-send). */
const STALE_LOCK_MINUTES = 15;

export interface OutboxRow extends Record<string, unknown> {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Normalise the payload to an object.
 *
 * A jsonb column can come back as a parsed object or as a JSON string,
 * depending on how the value was written, `'{"a":1}'::jsonb` yields an object,
 * but binding an already-stringified value can store a jsonb *string scalar*
 * instead. Both are valid jsonb and they read back differently.
 *
 * This is worth guarding rather than fixing at one call site: the failure mode
 * is `payload.registrationId` being undefined, which this worker would report as
 * "no recipients" and mark SENT. Silently succeeding at sending nothing is the
 * one outcome this pipeline must never produce.
 */
function asObject(payload: unknown): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      const parsed: unknown = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

/**
 * Claim one due message.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes concurrent workers safe: two
 * invocations racing take different rows instead of both taking the first.
 * Cron and QStash can both fire, so this is not hypothetical.
 *
 * A row is due when it is PENDING and past next_attempt_at, or PROCESSING and
 * its lock has gone stale, the latter recovers messages whose worker died
 * between the claim and the send.
 */
export async function claimNext(preferId?: string): Promise<OutboxRow | null> {
  const rows = await db.execute<OutboxRow>(sql`
    WITH candidate AS (
      SELECT id
      FROM outbox_message
      WHERE (
              (status = 'PENDING' AND next_attempt_at <= now())
              OR (status = 'PROCESSING'
                  AND locked_at < now() - ${`${STALE_LOCK_MINUTES} minutes`}::interval)
            )
        AND (${preferId ?? null}::uuid IS NULL OR id = ${preferId ?? null})
      ORDER BY next_attempt_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_message o
    SET status    = 'PROCESSING',
        locked_at = now(),
        attempts  = o.attempts + 1
    FROM candidate c
    WHERE o.id = c.id
    RETURNING o.id, o.topic, o.payload, o.attempts
  `);
  return (Array.from(rows) as OutboxRow[]).at(0) ?? null;
}

interface Recipient {
  userId: string | null;
  email: string;
  vars: Record<string, string>;
  templateCode: string;
  entityType: string;
  entityId: string;
  actionUrl: string | null;
}

/**
 * Either a recipient list or a reason this message can never be delivered.
 *
 * The distinction matters. "No recipients" and "I do not know this topic" both
 * produce zero emails, but the first is a lead the business will phone instead
 * and the second is a bug. Collapsing them into one outcome means either
 * retrying a typo'd topic forever, or marking a broken message SENT, and a
 * queue full of SENT messages that delivered nothing is worse than a visibly
 * failing one.
 */
type Resolution =
  { kind: 'recipients'; list: Recipient[] } | { kind: 'undeliverable'; reason: string };

/**
 * Topic → who gets what.
 *
 * Adding a topic means adding a case here and a template row.
 */
async function resolveRecipients(row: OutboxRow): Promise<Resolution> {
  const payload = asObject(row.payload);

  switch (row.topic) {
    /**
     * A colleague was invited from /team and cannot sign in yet, the account
     * has no password. This email is the only way in, so an undeliverable one
     * means somebody was given an account they will never reach.
     */
    case 'notification.staff-invited': {
      const userId = String(payload.userId ?? '');
      if (!userId) {
        return { kind: 'undeliverable', reason: 'payload has no userId' };
      }

      const found = await db.execute<{
        email: string | null;
        fullName: string;
        roleNames: string | null;
      }>(sql`
        SELECT u.email,
               u.full_name AS "fullName",
               (SELECT string_agg(r.name, ', ' ORDER BY r.name)
                FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id) AS "roleNames"
        FROM users u WHERE u.id = ${userId}::uuid LIMIT 1
      `);
      const row_ = (Array.from(found) as Array<Record<string, string | null>>).at(0);
      if (!row_) return { kind: 'undeliverable', reason: `user ${userId} not found` };
      if (!row_.email) return { kind: 'undeliverable', reason: 'account has no email address' };

      // Minted at send time, see the enrollment case below for why.
      const actionLink = await generatePasswordLink(String(row_.email));

      return {
        kind: 'recipients',
        list: [
          {
            userId,
            email: String(row_.email),
            templateCode: 'staff.invited',
            entityType: 'user',
            entityId: userId,
            actionUrl: actionLink,
            vars: {
              fullName: String(row_.fullName ?? ''),
              roleNames: String(row_.roleNames ?? 'tim'),
              setPasswordUrl: actionLink ?? `${process.env.INTERNAL_URL ?? ''}/login`,
              loginUrl: process.env.INTERNAL_URL ?? '',
            },
          },
        ],
      };
    }

    case 'notification.lead-received': {
      const registrationId = String(payload.registrationId ?? '');
      if (!registrationId) {
        return {
          kind: 'undeliverable',
          reason: `payload has no registrationId (keys: ${Object.keys(payload).join(',') || 'none'})`,
        };
      }

      const found = await db.execute<{
        id: string;
        childName: string;
        parentName: string | null;
        parentEmail: string | null;
        programName: string | null;
      }>(sql`
        SELECT r.id,
               r.child_name  AS "childName",
               r.parent_name AS "parentName",
               r.parent_email AS "parentEmail",
               p.name        AS "programName"
        FROM registrations r
        LEFT JOIN programs p ON p.id = r.program_id
        WHERE r.id = ${registrationId}::uuid
      `);
      const lead = (Array.from(found) as Array<Record<string, string | null>>).at(0);
      if (!lead) {
        return { kind: 'undeliverable', reason: `registration ${registrationId} not found` };
      }

      // A lead with no email is not an error, the Secretary will phone them.
      if (!lead.parentEmail) {
        logger.info('lead_has_no_email', { outboxId: row.id, registrationId });
        return { kind: 'recipients', list: [] };
      }

      return {
        kind: 'recipients',
        list: [
          {
            userId: null, // no account yet. This fires before conversion
            email: lead.parentEmail,
            templateCode: 'lead.received',
            entityType: 'registration',
            entityId: registrationId,
            actionUrl: null,
            vars: {
              parentName: lead.parentName ?? 'Bapak/Ibu',
              childName: lead.childName ?? '',
              programName: lead.programName ?? 'program yang dipilih',
            },
          },
        ],
      };
    }

    /**
     * Welcome + set-password link + the invoice, in ONE email (FR-ENR-3).
     *
     * The requirement lists three things; this sends them together rather than
     * as three messages. A brand-new address receiving three emails in one
     * second from a domain it has never seen is a spam-filter pattern, and this
     * channel has no fallback if it is filtered (doc 08 §4.1). It is also the
     * first impression the business makes.
     */
    case 'notification.enrollment-created': {
      const studentId = String(payload.studentId ?? '');
      const invoiceId = String(payload.invoiceId ?? '');
      if (!studentId || !invoiceId) {
        return {
          kind: 'undeliverable',
          reason: `payload needs studentId and invoiceId (keys: ${Object.keys(payload).join(',') || 'none'})`,
        };
      }

      const found = await db.execute<Record<string, string | number | null>>(sql`
        SELECT u.id            AS "userId",
               u.email,
               s.name          AS "childName",
               s.parent_name   AS "parentName",
               i.number        AS "invoiceNumber",
               i.amount,
               i.due_date      AS "dueDate",
               p.name          AS "programName"
        FROM invoices i
        JOIN students s   ON s.id = i.student_id
        JOIN users u      ON u.id = s.user_id
        LEFT JOIN enrollments e ON e.student_id = s.id
        LEFT JOIN programs p    ON p.id = e.program_id
        WHERE i.id = ${invoiceId}::uuid
        LIMIT 1
      `);
      const row = (Array.from(found) as Array<Record<string, string | number | null>>).at(0);
      if (!row) {
        return { kind: 'undeliverable', reason: `invoice ${invoiceId} not found` };
      }
      if (!row.email) {
        return { kind: 'undeliverable', reason: 'guardian account has no email address' };
      }

      /**
       * The set-password link is generated HERE, at send time, not at
       * conversion. These links expire; one minted during a conversion that
       * then sat in a retry queue for six hours would arrive already dead, and
       * the parent would be locked out of an invoice they are being chased for.
       */
      const actionLink = await generatePasswordLink(String(row.email));

      return {
        kind: 'recipients',
        list: [
          {
            userId: String(row.userId),
            email: String(row.email),
            templateCode: 'enrollment.created',
            entityType: 'invoice',
            entityId: invoiceId,
            actionUrl: actionLink,
            vars: {
              parentName: String(row.parentName ?? 'Bapak/Ibu'),
              childName: String(row.childName ?? ''),
              programName: String(row.programName ?? 'program yang dipilih'),
              invoiceNumber: String(row.invoiceNumber ?? ''),
              amount: formatIdr(Number(row.amount ?? 0)),
              dueDate: formatDateId(String(row.dueDate ?? '')),
              setPasswordUrl: actionLink ?? `${process.env.PORTAL_URL ?? ''}/login`,
            },
          },
        ],
      };
    }

    /**
     * The three payment moments, all addressed to the guardian.
     *
     * They share one query and one shape because they are the same email with
     * different words: which invoice, how much, what happens next. Splitting
     * them into three resolvers would triple the places a column rename breaks.
     */
    case 'notification.payment-submitted':
    case 'notification.payment-verified':
    case 'notification.payment-rejected':
    case 'notification.invoice-issued':
    case 'notification.invoice-reminder': {
      const invoiceId = String(payload.invoiceId ?? '');
      if (!invoiceId) {
        return { kind: 'undeliverable', reason: 'payload has no invoiceId' };
      }

      const found = await db.execute<Record<string, string | number | null>>(sql`
        SELECT u.id          AS "userId",
               u.email,
               s.name        AS "childName",
               s.parent_name AS "parentName",
               i.number      AS "invoiceNumber",
               i.amount,
               i.late_fee    AS "lateFee",
               i.period,
               i.status::text AS status,
               i.due_date    AS "dueDate",
               COALESCE((SELECT sum(p.gross_amount)::int FROM payments p
                         WHERE p.invoice_id = i.id AND p.verified_at IS NOT NULL), 0) AS "paidAmount"
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        JOIN users u    ON u.id = s.user_id
        WHERE i.id = ${invoiceId}::uuid
      `);
      const row2 = (Array.from(found) as Array<Record<string, string | number | null>>).at(0);
      if (!row2) return { kind: 'undeliverable', reason: `invoice ${invoiceId} not found` };
      if (!row2.email) {
        return { kind: 'undeliverable', reason: 'guardian account has no email address' };
      }

      const templateCode = {
        'notification.payment-submitted': 'payment.submitted',
        'notification.payment-verified': 'payment.verified',
        'notification.payment-rejected': 'payment.rejected',
        'notification.invoice-issued': 'invoice.issued',
        /**
         * One reminder template for all four stages, not four.
         *
         * The copy differs only in tone, and `{{reminderLine}}` carries that,
         * four near-identical templates is four places a bank detail change has
         * to be repeated, and three of them will be missed.
         */
        'notification.invoice-reminder': 'invoice.reminder',
      }[row.topic]!;

      const amount = Number(row2.amount ?? 0);
      const paid = Number(row2.paidAmount ?? 0);
      const fee = Number(row2.lateFee ?? 0);

      /**
       * The stage decides the tone, and only the tone (FR-PAY-6).
       *
       * H-3 is a courtesy, H is the due date, H+1 is late, H+7 is the day the
       * denda starts. Saying which is which matters more than the wording: a
       * parent who cannot tell "due soon" from "you now owe a penalty" will
       * treat both the same way.
       */
      const offset = payload.offset === undefined ? null : Number(payload.offset);
      const reminderLine =
        offset === null
          ? ''
          : offset < 0
            ? `Tagihan ini jatuh tempo dalam ${Math.abs(offset)} hari.`
            : offset === 0
              ? 'Tagihan ini jatuh tempo hari ini.'
              : offset <= 7
                ? `Tagihan ini sudah lewat ${offset} hari dari jatuh tempo.`
                : `Tagihan ini sudah lewat ${offset} hari, denda mulai berjalan.`;

      const feeLine =
        fee > 0
          ? `Denda keterlambatan: ${formatIdr(fee)}\nTotal yang harus dibayar: ${formatIdr(amount + fee - paid)}`
          : `Total yang harus dibayar: ${formatIdr(Math.max(amount + fee - paid, 0))}`;

      return {
        kind: 'recipients',
        list: [
          {
            userId: String(row2.userId),
            email: String(row2.email),
            templateCode,
            entityType: 'invoice',
            entityId: invoiceId,
            actionUrl: `${process.env.PORTAL_URL ?? ''}/portal/billing`,
            vars: {
              parentName: String(row2.parentName ?? 'Bapak/Ibu'),
              childName: String(row2.childName ?? ''),
              invoiceNumber: String(row2.invoiceNumber ?? ''),
              period: String(row2.period ?? ''),
              amount: formatIdr(amount),
              paidAmount: formatIdr(paid),
              remaining: formatIdr(Math.max(amount + fee - paid, 0)),
              lateFee: formatIdr(fee),
              feeLine,
              reminderLine,
              dueDate: formatDateId(String(row2.dueDate ?? '')),
              reason: String(payload.reason ?? ''),
              portalUrl: `${process.env.PORTAL_URL ?? 'http://localhost:3001'}/portal/billing`,
            },
          },
        ],
      };
    }

    /**
     * A reschedule request has been decided (doc 13 §12.6, doc 14 §3.2).
     *
     * Addressed to the account that ASKED, not to the student's guardian on
     * file. Usually the same person, but staff can file a request after a
     * phone call, and telling the parent "your request was approved" when they
     * never made one reads as a change they did not ask for.
     *
     * One template for approve and reject: `decisionLine` is the only thing
     * that differs, which is the same call `invoice.reminder` makes for its
     * four stages.
     */
    case 'notification.reschedule-decided': {
      const requestId = String(payload.requestId ?? '');
      if (!requestId) {
        return { kind: 'undeliverable', reason: 'payload has no requestId' };
      }

      const found = await db.execute<Record<string, string | null>>(sql`
        SELECT u.id            AS "userId",
               u.email,
               u.full_name     AS "requesterName",
               st.name         AS "childName",
               st.parent_name  AS "parentName",
               r.status::text  AS status,
               r.decision_note AS "decisionNote",
               s.starts_at     AS "originalStartsAt",
               n.starts_at     AS "newStartsAt"
        FROM reschedule_requests r
        JOIN sessions s   ON s.id = r.session_id
        JOIN students st  ON st.id = s.student_id
        JOIN users u      ON u.id = r.requested_by_id
        LEFT JOIN sessions n ON n.id = r.new_session_id
        WHERE r.id = ${requestId}::uuid
      `);
      const req = (Array.from(found) as Array<Record<string, string | null>>).at(0);
      if (!req) return { kind: 'undeliverable', reason: `request ${requestId} not found` };
      if (!req.email) {
        return { kind: 'undeliverable', reason: 'requester has no email address' };
      }

      const when = (value: string | null | undefined) =>
        value
          ? new Intl.DateTimeFormat('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Makassar',
            }).format(new Date(value))
          : '';

      const decisionLine =
        req.status === 'APPROVED'
          ? `Disetujui. Jadwal baru: ${when(req.newStartsAt)} WITA.${
              req.decisionNote ? `\n\nCatatan tim: ${req.decisionNote}` : ''
            }`
          : `Mohon maaf, permintaan ini belum bisa kami penuhi.\n\nCatatan tim: ${
              req.decisionNote ?? '-'
            }\n\nJadwal tetap berjalan seperti semula.`;

      return {
        kind: 'recipients',
        list: [
          {
            userId: String(req.userId),
            email: String(req.email),
            templateCode: 'reschedule.decided',
            entityType: 'reschedule_request',
            entityId: requestId,
            actionUrl: `${process.env.PORTAL_URL ?? ''}/portal/schedule`,
            vars: {
              parentName: String(req.parentName ?? req.requesterName ?? 'Bapak/Ibu'),
              childName: String(req.childName ?? ''),
              originalWhen: when(req.originalStartsAt),
              decisionLine,
              portalUrl: `${process.env.PORTAL_URL ?? 'http://localhost:3001'}/portal/schedule`,
            },
          },
        ],
      };
    }

    /**
     * FR-ASN-5, "appears in the portal, awards points, notifies the parent".
     *
     * Addressed to the guardian who owns the student record, which is the
     * account that can actually open the link: `students.user_id` is the
     * parent's user (doc 09), not the child's.
     *
     * The email carries the score and the category and NOT the mentor's note.
     * The note is the qualitative part a family should read in context, beside
     * the four criteria it refers to, and email is forwarded, printed and left
     * open on shared screens in a way a logged-in portal page is not.
     */
    case 'notification.assessment-ready': {
      const assessmentId = String(payload.assessmentId ?? '');
      if (!assessmentId) {
        return { kind: 'undeliverable', reason: 'payload has no assessmentId' };
      }

      const found = await db.execute<Record<string, string | null>>(sql`
        SELECT u.id           AS "userId",
               u.email,
               st.name        AS "childName",
               st.parent_name AS "parentName",
               a.period,
               a.avg_score::text AS "avgScore",
               a.category::text  AS category,
               a.points_awarded::text AS "points",
               m.full_name    AS "mentorName"
        FROM assessments a
        JOIN students st ON st.id = a.student_id
        JOIN users u     ON u.id = st.user_id
        LEFT JOIN users m ON m.id = a.mentor_id
        WHERE a.id = ${assessmentId}::uuid
      `);
      const row2 = (Array.from(found) as Array<Record<string, string | null>>).at(0);
      if (!row2) return { kind: 'undeliverable', reason: `assessment ${assessmentId} not found` };
      if (!row2.email) return { kind: 'undeliverable', reason: 'guardian has no email address' };

      const CATEGORY_LABEL: Record<string, string> = {
        SANGAT_BAIK: 'Sangat Baik',
        BAIK: 'Baik',
        CUKUP: 'Cukup',
        PERLU_PERHATIAN: 'Perlu Perhatian',
      };

      return {
        kind: 'recipients',
        list: [
          {
            userId: String(row2.userId),
            email: String(row2.email),
            templateCode: 'assessment.ready',
            entityType: 'assessment',
            entityId: assessmentId,
            actionUrl: `${process.env.PORTAL_URL ?? ''}/portal/assessments`,
            vars: {
              parentName: String(row2.parentName ?? 'Bapak/Ibu'),
              childName: String(row2.childName ?? ''),
              period: formatPeriodId(String(row2.period ?? '')),
              avgScore: String(row2.avgScore ?? '0'),
              category: CATEGORY_LABEL[String(row2.category)] ?? String(row2.category ?? ''),
              points: String(row2.points ?? '0'),
              mentorName: String(row2.mentorName ?? 'Tim Metroscope'),
              portalUrl: `${process.env.PORTAL_URL ?? 'http://localhost:3001'}/portal/assessments`,
            },
          },
        ],
      };
    }

    default:
      return { kind: 'undeliverable', reason: `unknown topic "${row.topic}"` };
  }
}

/** "2026-08" → "Agustus 2026". Periods are WITA calendar months. */
function formatPeriodId(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Rp 750.000. Indonesian formatting, integer rupiah (CLAUDE.md). */
function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

/** 7 Agustus 2026 */
function formatDateId(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A single-use link that lets the guardian set their first password.
 *
 * Returns null rather than throwing when Supabase is unreachable: the welcome
 * email is still worth sending, and the template falls back to the plain login
 * URL where "forgot password" is one click away. Losing the whole email over a
 * missing convenience link would be the worse trade.
 */
async function generatePasswordLink(email: string): Promise<string | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (error) {
      logger.warn('password_link_failed', { message: error.message });
      return null;
    }
    return data.properties?.action_link ?? null;
  } catch (err) {
    logger.warn('password_link_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

type Outcome = { status: 'SENT' | 'FAILED' | 'RETRY'; detail: string };

/**
 * `calendar.sync` and `calendar.cancel` (doc 07 §6).
 *
 * The mapping from a sync outcome to an outbox outcome is the whole reason this
 * lives in the worker rather than inline in the scheduling service:
 *
 *   SKIPPED  → SENT.  Nothing to do, and nothing will change on a retry,
 *                     Google is unconfigured, or the session is gone.
 *   SYNCED   → SENT.
 *   FAILED   → RETRY when the category says so (5xx, rate limit, network),
 *              FAILED when it does not (revoked key, calendar shared with
 *              nobody, malformed event). Retrying the second kind forever
 *              buries the real problem under an attempt count.
 */
async function processCalendarMessage(row: OutboxRow): Promise<Outcome> {
  const payload = asObject(row.payload);
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
  if (!sessionId) return { status: 'FAILED', detail: 'payload has no sessionId' };

  const { syncSessionToCalendar, cancelSessionCalendarEvent } =
    await import('@/modules/scheduling/calendar.service');

  const result =
    row.topic === 'calendar.cancel'
      ? await cancelSessionCalendarEvent(sessionId)
      : await syncSessionToCalendar(sessionId);

  if (result.status === 'SYNCED') {
    return { status: 'SENT', detail: `event ${result.eventId}` };
  }
  if (result.status === 'SKIPPED') {
    return { status: 'SENT', detail: result.reason };
  }
  return {
    status: result.retryable ? 'RETRY' : 'FAILED',
    detail: `${result.category}: ${result.detail}`,
  };
}

/**
 * Process one claimed message.
 *
 * Never throws: the caller must always be able to record an outcome. A thrown
 * error would leave the row in PROCESSING until the stale-lock sweep, turning a
 * bad template into a 15-minute delay on everything behind it.
 */
export async function processMessage(row: OutboxRow): Promise<Outcome> {
  try {
    /**
     * Calendar sync is not an email, and forcing it through `resolveRecipients`
     * would mean inventing a recipient for something that has none.
     *
     * It goes through the OUTBOX, though, and that is the point (§17): the
     * claim-with-SKIP-LOCKED, the backoff schedule, the attempt ceiling, the
     * stale-lock recovery and the dead-letter behaviour are all machinery this
     * worker already has, and doc 07 §6 draws calendar sync as a worker job.
     * Building a second queue beside it would double the operational surface to
     * gain nothing.
     */
    if (row.topic.startsWith('calendar.')) return processCalendarMessage(row);

    const resolved = await resolveRecipients(row);

    /**
     * Undeliverable is FAILED, not SENT and not RETRY. An unknown topic or a
     * malformed payload will look identical on every future attempt, so retrying
     * is pointless, but marking it SENT would hide a bug behind a green queue.
     * FAILED keeps it visible with its reason attached.
     */
    if (resolved.kind === 'undeliverable') {
      logger.error('outbox_undeliverable', {
        outboxId: row.id,
        topic: row.topic,
        reason: resolved.reason,
      });
      return { status: 'FAILED', detail: resolved.reason };
    }

    const recipients = resolved.list;
    if (recipients.length === 0) {
      // Nothing to send is done. Retrying would never produce a recipient.
      return { status: 'SENT', detail: 'no recipients' };
    }

    const channel = emailChannel();
    let sent = 0;
    let skipped = 0;
    /** Worth another attempt, network blips, 5xx, rate limits. */
    const failures: string[] = [];
    /** Will fail the same way forever, bad address, unverified sender, 4xx. */
    const permanent: string[] = [];

    for (const r of recipients) {
      const template = await loadTemplate(r.templateCode);
      if (!template) {
        // Permanent: a missing template will still be missing in six hours.
        failures.push(`template ${r.templateCode} not found or inactive`);
        continue;
      }

      /**
       * Claim the send BEFORE calling the provider.
       *
       * The unique dedupe_key is what makes at-least-once delivery safe. If the
       * insert conflicts, another attempt already owns this send, stop. Doing
       * this after the provider call would leave a window where a retry sends a
       * second copy of the same email.
       */
      const dedupeKey = `${row.id}:${r.userId ?? r.email}:EMAIL`;
      const claimed = await db.execute<{ id: string }>(sql`
        INSERT INTO notifications
          (user_id, recipient_email, channel, template, payload, status,
           entity_type, entity_id, action_url, dedupe_key)
        VALUES (${r.userId}, ${r.email}, 'EMAIL', ${r.templateCode},
                ${JSON.stringify(r.vars)}::jsonb, 'PENDING',
                ${r.entityType}, ${r.entityId}, ${r.actionUrl}, ${dedupeKey})
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
      `);
      const notificationId = (Array.from(claimed) as { id: string }[]).at(0)?.id;
      if (!notificationId) {
        skipped++;
        continue;
      }

      const rendered = render(template, r.vars);
      if (rendered.missing.length) {
        // Sent anyway, a slightly thin email beats no email, but loudly.
        logger.warn('template_missing_vars', {
          template: r.templateCode,
          missing: rendered.missing,
          outboxId: row.id,
        });
      }

      const result = await channel.send({
        to: r.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tag: row.topic,
      });

      if (result.ok) {
        sent++;
        await db.execute(sql`
          UPDATE notifications
          SET status = 'SENT',
              sent_at = now(),
              provider_message_id = ${result.providerMessageId},
              payload = ${JSON.stringify({ ...r.vars, subject: rendered.subject })}::jsonb
          WHERE id = ${notificationId}
        `);
      } else {
        await db.execute(sql`
          UPDATE notifications
          SET status = ${result.retryable ? 'PENDING' : 'FAILED'},
              last_error = ${result.error},
              dedupe_key = ${result.retryable ? null : dedupeKey}
          WHERE id = ${notificationId}
        `);
        /**
         * Release the dedupe claim on a retryable failure. Holding it would mean
         * the next attempt hits ON CONFLICT, counts the send as already done,
         * and the email is never delivered, the queue would look healthy.
         */
        if (result.retryable) {
          failures.push(result.error);
        } else {
          permanent.push(result.error);
          logger.error('email_permanently_failed', {
            outboxId: row.id,
            template: r.templateCode,
            error: result.error,
          });
        }
      }
    }

    /**
     * A permanent failure dies now, not in six hours.
     *
     * The channel already worked out that an unverified sender or a malformed
     * request will fail identically forever. Feeding that into the retry counter
     * anyway meant five pointless attempts spread over eight hours before the
     * message finally showed as FAILED, the error was known on the first one.
     */
    if (permanent.length) {
      return { status: 'FAILED', detail: permanent.join('; ').slice(0, 500) };
    }

    if (failures.length === 0) {
      return { status: 'SENT', detail: `sent ${sent}, skipped ${skipped}` };
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return { status: 'FAILED', detail: failures.join('; ').slice(0, 500) };
    }
    return { status: 'RETRY', detail: failures.join('; ').slice(0, 500) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: row.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'RETRY',
      detail: detail.slice(0, 500),
    };
  }
}

/** Record the outcome and schedule the next attempt if there is one. */
export async function finalize(row: OutboxRow, outcome: Outcome): Promise<void> {
  if (outcome.status === 'SENT') {
    await db.execute(sql`
      UPDATE outbox_message
      SET status = 'SENT', locked_at = NULL, last_error = NULL
      WHERE id = ${row.id}
    `);
    return;
  }

  if (outcome.status === 'FAILED') {
    await db.execute(sql`
      UPDATE outbox_message
      SET status = 'FAILED', locked_at = NULL, last_error = ${outcome.detail}
      WHERE id = ${row.id}
    `);
    logger.error('outbox_message_dead', {
      outboxId: row.id,
      topic: row.topic,
      attempts: row.attempts,
      error: outcome.detail,
    });
    return;
  }

  const minutes = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1;
  await db.execute(sql`
    UPDATE outbox_message
    SET status = 'PENDING',
        locked_at = NULL,
        last_error = ${outcome.detail},
        next_attempt_at = now() + ${`${minutes} minutes`}::interval
    WHERE id = ${row.id}
  `);
  logger.warn('outbox_retry_scheduled', {
    outboxId: row.id,
    topic: row.topic,
    attempt: row.attempts,
    inMinutes: minutes,
    error: outcome.detail,
  });
}

/** Claim, process and finalize one message. Returns false when nothing was due. */
export async function drainOne(preferId?: string): Promise<boolean> {
  const row = await claimNext(preferId);
  if (!row) return false;

  const outcome = await processMessage(row);
  await finalize(row, outcome);

  logger.info('outbox_processed', {
    outboxId: row.id,
    topic: row.topic,
    attempt: row.attempts,
    outcome: outcome.status,
    detail: outcome.detail,
  });
  return true;
}
