import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import {
  CalendarError,
  cancelEvent,
  createEvent,
  findEventBySessionId,
  patchEvent,
  type CalendarEventInput,
} from '@/lib/google/calendar';
import { calendarConfigured, googleCredentials } from '@/lib/google/credentials';
import { SCHEDULE_TIMEZONE, toZonedRfc3339 } from './schedule-time';

export { SCHEDULE_TIMEZONE, toZonedRfc3339 };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A lesson, expressed as a Google Calendar event. (doc 03 §6.2, doc 07 §6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * doc 07 §6 is one line of a flowchart:
 *
 *   Session scheduled → [[Worker: calendar-sync]] → Google Calendar event +
 *   Meet link → Session.gcalEventId + meetUrl → Portal shows Join Meet
 *
 * This is that worker's body. It runs on the OWNER connection with no RLS, for
 * the same reason `dispatch.ts` does: a background job has no caller, so
 * `asUser()` has nobody to be. Authorisation happened when the session was
 * created. This only reflects an existing decision into Google.
 *
 * ⚠️ Every write here is expressed so that running it twice is the same as
 * running it once. The outbox retries, the cron re-sweeps, and Google can
 * accept a request whose response we never see.
 */

interface SessionRow extends Record<string, unknown> {
  id: string;
  /** The driver returns timestamptz as a string; toZonedRfc3339 coerces. */
  starts_at: Date | string;
  ends_at: Date | string;
  type: string;
  status: string;
  note: string | null;
  gcal_event_id: string | null;
  gcal_calendar_id: string | null;
  meet_url: string | null;
  student_name: string | null;
  mentor_name: string | null;
  program_name: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  LESSON: 'Les',
  CONSULTATION: 'Konsultasi',
  ASSESSMENT: 'Assessment',
};

/**
 * Which lessons get a Meet conference.
 *
 * Every type currently does: doc 01 §domain calls a Session "synced to Google
 * Calendar with a Google Meet link", and doc 05 §2.1 shows "Join Meet" on the
 * portal card for lessons. Kept as a function rather than inlined so that an
 * in-person lesson type can opt out later without touching the sync path.
 */
function wantsMeet(row: SessionRow): boolean {
  return row.status === 'SCHEDULED';
}

export function buildEventInput(row: SessionRow): CalendarEventInput {
  const label = TYPE_LABEL[row.type] ?? 'Sesi';
  const who = row.student_name ?? 'Siswa';
  const summary = row.program_name ? `${label} ${row.program_name}, ${who}` : `${label}, ${who}`;

  const description = [
    row.program_name ? `Program: ${row.program_name}` : null,
    row.mentor_name ? `Mentor: ${row.mentor_name}` : null,
    `Siswa: ${who}`,
    row.note ? `\nCatatan: ${row.note}` : null,
    `\nDibuat otomatis oleh Metroscope. Perubahan jadwal dilakukan di aplikasi, bukan di Google Calendar.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    summary,
    description,
    startsAt: toZonedRfc3339(row.starts_at),
    endsAt: toZonedRfc3339(row.ends_at),
    timeZone: SCHEDULE_TIMEZONE,
    withMeet: wantsMeet(row),
    sessionId: row.id,
  };
}

async function loadSession(sessionId: string): Promise<SessionRow | null> {
  const rows = await db.execute<SessionRow>(sql`
    SELECT s.id, s.starts_at, s.ends_at, s.type::text AS type, s.status::text AS status, s.note,
           s.gcal_event_id, s.gcal_calendar_id, s.meet_url,
           st.name AS student_name,
           u.full_name AS mentor_name,
           p.name AS program_name
    FROM sessions s
    LEFT JOIN students st ON st.id = s.student_id
    LEFT JOIN users u ON u.id = s.mentor_id
    LEFT JOIN programs p ON p.id = s.program_id
    WHERE s.id = ${sessionId}::uuid
  `);
  return (Array.from(rows) as SessionRow[]).at(0) ?? null;
}

/**
 * The conference request id.
 *
 * Derived from the session, so a retry asks Google for *the same* conference
 * rather than a second one. Google keys `createRequest.requestId` per event,
 * which is exactly the granularity wanted here.
 */
const conferenceRequestId = (sessionId: string) => `metroscope-${sessionId}`;

export type SyncOutcome =
  | { status: 'SYNCED'; eventId: string; meetUrl: string | null }
  | { status: 'SKIPPED'; reason: string }
  | { status: 'FAILED'; category: string; retryable: boolean; detail: string };

/**
 * Create or update the Google event for one session.
 *
 * ── Idempotency (§9) ──
 *
 * Three cases, in the order they are checked:
 *
 *   1. We hold an event id → PATCH it. Reschedules therefore move the existing
 *      event instead of adding a second one (§10).
 *   2. We hold none, but Google has one carrying this session's id → adopt it.
 *      This is the reconciliation for "Google accepted the insert and we died
 *      before writing the id down", which is otherwise indistinguishable from
 *      "never created" and produces duplicates on retry.
 *   3. Neither → create.
 */
export async function syncSessionToCalendar(sessionId: string): Promise<SyncOutcome> {
  if (!calendarConfigured()) {
    await db.execute(sql`
      UPDATE sessions SET gcal_sync_status = 'DISABLED', gcal_sync_error = NULL
      WHERE id = ${sessionId}::uuid
    `);
    return { status: 'SKIPPED', reason: 'calendar not configured' };
  }

  const row = await loadSession(sessionId);
  if (!row) return { status: 'SKIPPED', reason: 'session no longer exists' };

  /**
   * A cancelled session must not be (re)created as an active event. This is
   * reachable in practice: a sync message queued before a cancellation can be
   * claimed after it.
   */
  if (row.status === 'CANCELLED' || row.status === 'RESCHEDULED') {
    return cancelSessionCalendarEvent(sessionId);
  }

  const creds = googleCredentials()!;
  const input = buildEventInput(row);
  const requestId = conferenceRequestId(sessionId);

  try {
    /**
     * Meet is a bonus; the lesson being on the calendar is the point.
     *
     * Google refuses `conferenceSolutionKey: hangoutsMeet` with
     * `400 "Invalid conference type value."` when the calendar's owning account
     * cannot mint Meet links, a service account against a personal Google
     * account rather than a Workspace one. That is an account-type constraint,
     * not a malformed request, and the same call succeeds the moment the
     * conference block is dropped.
     *
     * Failing the whole sync over it would mean no calendar entry at all
     * because the optional half of the feature is unavailable. So the
     * conference is attempted once and, if it is the conference that Google
     * objects to, the event is written without one. The portal already renders
     * "Gabung Meet" only when a link exists (§3.1), and "Add to Google
     * Calendar" is unaffected.
     */
    const write = async (eventInput: CalendarEventInput) => {
      if (row.gcal_event_id && row.gcal_calendar_id === creds.calendarId) {
        return patchEvent(row.gcal_event_id, eventInput, requestId);
      }
      const existing = await findEventBySessionId(sessionId);
      return existing
        ? patchEvent(existing.id, eventInput, requestId)
        : createEvent(eventInput, requestId);
    };

    let event;
    let meetRefused = false;
    try {
      event = await write(input);
    } catch (err) {
      const conferenceRejected =
        err instanceof CalendarError &&
        err.status === 400 &&
        /conference/i.test(err.message) &&
        input.withMeet;
      if (!conferenceRejected) throw err;

      meetRefused = true;
      logger.warn('calendar_meet_unavailable', {
        sessionId,
        reason: 'google refused the conference type, calendar owner cannot create Meet links',
      });
      event = await write({ ...input, withMeet: false });
    }

    const meetUrl = event.hangoutLink ?? null;

    /**
     * Written in one statement with the id, so a row can never claim SYNCED
     * without the event id the constraint requires. `meet_url` is only
     * overwritten when Google gave us one, a manually entered link must not be
     * erased by a sync that produced no conference.
     */
    await db.execute(sql`
      UPDATE sessions
      SET gcal_event_id   = ${event.id},
          gcal_calendar_id = ${creds.calendarId},
          gcal_sync_status = 'SYNCED',
          gcal_synced_at   = now(),
          gcal_sync_error  = NULL,
          meet_url         = COALESCE(${meetUrl}, meet_url),
          updated_at       = now()
      WHERE id = ${sessionId}::uuid
    `);

    logger.info('calendar_sync_ok', {
      sessionId,
      googleEventId: event.id,
      operation: row.gcal_event_id ? 'patch' : 'create',
      hasMeet: Boolean(meetUrl),
      meetRefused,
    });

    return { status: 'SYNCED', eventId: event.id, meetUrl };
  } catch (err) {
    const e =
      err instanceof CalendarError
        ? err
        : new CalendarError('unknown', true, err instanceof Error ? err.message : 'sync failed');

    /**
     * The lesson itself is untouched. Only the sync state records the failure,
     * which is what doc 03 §7 means by "retried and surfaced", the schedule
     * stays valid and correct while Google is unreachable (§18).
     *
     * The CATEGORY is stored, never the provider's body: a Google error can
     * echo the calendar id and account detail, and staff UI reads this column.
     */
    await db.execute(sql`
      UPDATE sessions
      SET gcal_sync_status = 'FAILED', gcal_sync_error = ${e.category}, updated_at = now()
      WHERE id = ${sessionId}::uuid
    `);

    logger.error('calendar_sync_failed', {
      sessionId,
      operation: row.gcal_event_id ? 'patch' : 'create',
      errorCategory: e.category,
      retryable: e.retryable,
      status: e.status,
    });

    return { status: 'FAILED', category: e.category, retryable: e.retryable, detail: e.message };
  }
}

/**
 * Cancel the Google event, keeping the application record. (§11)
 *
 * The session row is NOT deleted and its status is not changed here, the
 * application already decided that. This only stops participants seeing a
 * meeting that is not happening.
 */
export async function cancelSessionCalendarEvent(sessionId: string): Promise<SyncOutcome> {
  if (!calendarConfigured()) return { status: 'SKIPPED', reason: 'calendar not configured' };

  const row = await loadSession(sessionId);
  if (!row) return { status: 'SKIPPED', reason: 'session no longer exists' };
  if (!row.gcal_event_id) {
    /**
     * Nothing was ever synced, so there is nothing to cancel, and the row must
     * not be left PENDING, or the worker will keep picking it up forever.
     */
    await db.execute(sql`
      UPDATE sessions SET gcal_sync_status = 'DISABLED' WHERE id = ${sessionId}::uuid
    `);
    return { status: 'SKIPPED', reason: 'no calendar event to cancel' };
  }

  try {
    await cancelEvent(row.gcal_event_id);
    await db.execute(sql`
      UPDATE sessions
      SET gcal_sync_status = 'SYNCED', gcal_synced_at = now(), gcal_sync_error = NULL,
          updated_at = now()
      WHERE id = ${sessionId}::uuid
    `);
    logger.info('calendar_event_cancelled', { sessionId, googleEventId: row.gcal_event_id });
    return { status: 'SYNCED', eventId: row.gcal_event_id, meetUrl: row.meet_url };
  } catch (err) {
    const e =
      err instanceof CalendarError
        ? err
        : new CalendarError('unknown', true, err instanceof Error ? err.message : 'cancel failed');
    await db.execute(sql`
      UPDATE sessions
      SET gcal_sync_status = 'FAILED', gcal_sync_error = ${e.category}, updated_at = now()
      WHERE id = ${sessionId}::uuid
    `);
    logger.error('calendar_cancel_failed', {
      sessionId,
      errorCategory: e.category,
      retryable: e.retryable,
    });
    return { status: 'FAILED', category: e.category, retryable: e.retryable, detail: e.message };
  }
}
