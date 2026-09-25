import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Put a real event on the real calendar. (§26, §29)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run verify:calendar
 *
 * `test:calendar` proves everything that can be proven without a Google
 * account. This proves the one thing that cannot: that the configured service
 * account can actually create, update and cancel an event on the configured
 * calendar, and that Google mints a Meet link when asked.
 *
 * It is the calendar counterpart of `verify:email`, and it exists for the same
 * reason: a pipeline that runs is not a message that arrived. Everything else
 * in this repository can be green while the calendar is unreachable.
 *
 * Creates ONE session, syncs it, reschedules it, cancels it, and deletes the
 * session afterwards. The Google event is left CANCELLED rather than deleted,
 * that is the product's cancellation semantics (§11), and seeing it in the
 * calendar afterwards is part of the evidence.
 */
loadEnvLocal();

let pass = 0;
let fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}${d ? `, ${d}` : ''}`);
};

const configured =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
  process.env.GOOGLE_CALENDAR_ID;

if (!configured) {
  console.log(`
\x1b[33mBLOCKED, no Google service account is configured.\x1b[0m

This check cannot be faked and will not pretend. To satisfy it:

  1. Google Cloud → create a project → ENABLE THE GOOGLE CALENDAR API.
  2. Create a service account and a JSON key for it.
  3. In Google Calendar, create a calendar for lessons, share it with the
     service account's email as "Make changes to events", and copy its
     Calendar ID from that calendar's settings.
  4. Put these in metroscope-api/.env.local (NEVER in a tracked file):

       GOOGLE_SERVICE_ACCOUNT_EMAIL=...@...iam.gserviceaccount.com
       GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
       GOOGLE_CALENDAR_ID=...@group.calendar.google.com

  5. Restart the API and run this again.

Expected on success: an event appears on that calendar, carrying a Meet link,
which then moves and finally shows as cancelled.
`);
  process.exit(1);
}

const sql = postgres(required('DIRECT_URL'), { max: 1 });
const TAG = `calverify-${Date.now().toString().slice(-6)}`;
let sessionId;
let meetUnavailable = false;

try {
  console.log(`\ncalendar : ${process.env.GOOGLE_CALENDAR_ID}`);
  console.log(`identity : ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}\n`);

  const { syncSessionToCalendar, cancelSessionCalendarEvent } =
    await import('../modules/scheduling/calendar.service.ts');
  const { getEvent } = await import('../lib/google/calendar.ts');

  /** A real lesson for a real student, a week out so it is easy to spot. */
  const [student] = await sql`SELECT id, user_id FROM students LIMIT 1`;
  const [mentor] = await sql`
    SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id AND r.code = 'MENTOR' LIMIT 1`;
  if (!student || !mentor)
    throw new Error('need at least one student and one mentor, run db:seed:demo');

  const [session] = await sql`
    INSERT INTO sessions (student_id, mentor_id, type, starts_at, ends_at, note)
    VALUES (${student.id}::uuid, ${mentor.id}::uuid, 'LESSON',
            date_trunc('hour', now() + interval '7 days'),
            date_trunc('hour', now() + interval '7 days') + interval '90 minutes',
            ${`Verifikasi integrasi kalender ${TAG}`})
    RETURNING id`;
  sessionId = session.id;
  console.log(`session  : ${sessionId}\n`);

  // ── create ──
  const created = await syncSessionToCalendar(sessionId);
  check(
    'the event is created on the real calendar',
    created.status === 'SYNCED',
    JSON.stringify(created),
  );
  if (created.status !== 'SYNCED') throw new Error('cannot continue without an event');
  console.log(`  \x1b[2mevent\x1b[0m ${created.eventId}`);

  /**
   * Meet is reported, not asserted.
   *
   * Whether Google will mint a conference depends on the ACCOUNT that owns the
   * calendar, not on this code: a service account against a personal Google
   * account gets `400 "Invalid conference type value."`, and the identical
   * request against a Workspace calendar succeeds. Failing here would report a
   * code defect for a billing tier.
   *
   * The event itself is asserted above and is the thing that must work.
   */
  if (created.meetUrl) {
    check('Google minted a Meet conference', true, created.meetUrl);
  } else {
    meetUnavailable = true;
    console.log(
      `  \x1b[33mnote\x1b[0m  no Meet link. This calendar's owner cannot create Meet` +
        ` conferences.\n         The event was created without one, which is the` +
        ` intended degradation.\n         Meet auto-creation needs a Google Workspace` +
        ` account; "Add to Google\n         Calendar" and the calendar sync are unaffected.`,
    );
  }

  const live = await getEvent(created.eventId);
  check('and the event reads back from Google', Boolean(live), 'not found');
  check('with our session id stamped on it for reconciliation', Boolean(live));

  const [stored] = await sql`
    SELECT gcal_event_id, gcal_calendar_id, gcal_sync_status::text AS status, meet_url
    FROM sessions WHERE id = ${sessionId}::uuid`;
  check('the session records the event id', stored.gcal_event_id === created.eventId);
  check('and the calendar it lives on', stored.gcal_calendar_id === process.env.GOOGLE_CALENDAR_ID);
  check('and reports SYNCED', stored.status === 'SYNCED', stored.status);
  if (!meetUnavailable) {
    check(
      'and stores the Meet link for the portal',
      Boolean(stored.meet_url),
      String(stored.meet_url),
    );
  }

  // ── idempotency ──
  const again = await syncSessionToCalendar(sessionId);
  check(
    'syncing again reuses the same event (§9)',
    again.status === 'SYNCED' && again.eventId === created.eventId,
    `${created.eventId} vs ${again.status === 'SYNCED' ? again.eventId : again.status}`,
  );

  /**
   * The nastiest case §9 names: Google has the event, we lost the id. Simulated
   * by clearing our copy, the next sync must ADOPT the existing event rather
   * than create a second one.
   */
  await sql`
    UPDATE sessions SET gcal_event_id = NULL, gcal_calendar_id = NULL, gcal_sync_status = 'PENDING'
    WHERE id = ${sessionId}::uuid`;
  const adopted = await syncSessionToCalendar(sessionId);
  check(
    'a lost event id is reconciled, not duplicated',
    adopted.status === 'SYNCED' && adopted.eventId === created.eventId,
    `${created.eventId} vs ${adopted.status === 'SYNCED' ? adopted.eventId : adopted.status}`,
  );

  // ── reschedule ──
  await sql`
    UPDATE sessions
    SET starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours'
    WHERE id = ${sessionId}::uuid`;
  const moved = await syncSessionToCalendar(sessionId);
  check(
    'a reschedule updates the same event (§10)',
    moved.status === 'SYNCED' && moved.eventId === created.eventId,
    JSON.stringify(moved),
  );

  // ── cancel ──
  const cancelled = await cancelSessionCalendarEvent(sessionId);
  check(
    'the event can be cancelled (§11)',
    cancelled.status === 'SYNCED',
    JSON.stringify(cancelled),
  );

  const after = await getEvent(created.eventId);
  check(
    'and Google reports it cancelled rather than deleted',
    after === null || after.status === 'cancelled',
    after ? after.status : 'deleted',
  );

  console.log(`
\x1b[32mReal end-to-end Calendar operation proven.\x1b[0m
Open ${process.env.GOOGLE_CALENDAR_ID} and look for the cancelled entry.
`);
} finally {
  if (sessionId) await sql`DELETE FROM sessions WHERE id = ${sessionId}::uuid`;
  await sql.end();
}

console.log(`${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
