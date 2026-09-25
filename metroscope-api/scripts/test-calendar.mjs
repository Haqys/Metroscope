import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Google Calendar + Meet integration (doc 03 §6.2, doc 07 §6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run test:calendar
 *
 * Two halves, and the split is deliberate.
 *
 * **The half that needs no Google account**: the "Add to Google Calendar"
 * link, the timezone arithmetic, the authorisation boundary, the sync-state
 * plumbing, is asserted here unconditionally. It is most of the surface a
 * family touches, and it must work whether or not a service account exists.
 *
 * **The half that talks to Google** is asserted against the REAL API when
 * credentials are configured and BLOCKED when they are not. It is never faked:
 * a green tick from a stubbed Google proves the stub works. `npm run
 * verify:calendar` is the one that puts a real event on a real calendar.
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const anonClient = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const TAG = 'caltest';
const RUN = Date.now().toString().slice(-6);
let pass = 0;
let fail = 0;
let blocked = 0;

const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}${!ok && d ? `, ${d}` : ''}`,
  );
};
const block = (n, why) => {
  blocked++;
  console.log(`  \x1b[33mBLOCK\x1b[0m ${n}, ${why}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function retry(fn, attempts = 10) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw last;
}

async function account(tag, roleCode) {
  const email = `${TAG}-${tag}-${RUN}@example.test`;
  const password = crypto.randomBytes(15).toString('base64url');
  const created = await retry(async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return data;
  });
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Cal ${tag}`})`;
  if (roleCode) {
    const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
    await sql`UPDATE users SET primary_role_id = ${roleId} WHERE id = ${created.user.id}`;
  }
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message ?? 'no session');
  return { id: created.user.id, email, token: data.session.access_token };
}

const api = (token) => async (method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const refused = (r) => r.status === 401 || r.status === 403;
const accounts = [];
let sessionId;

try {
  section('Setup');

  const head = await account('head', 'HEAD');
  const mentor = await account('mentor', 'MENTOR');
  const parentA = await account('parentA', 'PARENT');
  const parentB = await account('parentB', 'PARENT');
  accounts.push(head.id, mentor.id, parentA.id, parentB.id);
  const H = api(head.token);
  const M = api(mentor.token);
  const A = api(parentA.token);
  const B = api(parentB.token);
  const N = api(null);

  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog-${RUN}`}, 'Olimpiade Matematika', 'ACADEMIC', ARRAY['SMP'], 750000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`;
  const [studentA] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status, level)
    VALUES (${parentA.id}, 'Anak Kalender', ${`${TAG}-a-${RUN}`}, current_date, 'ACTIVE', 'ACTIVE', 'SMP')
    RETURNING id`;
  const [studentB] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status, level)
    VALUES (${parentB.id}, 'Anak Lain', ${`${TAG}-b-${RUN}`}, current_date, 'ACTIVE', 'ACTIVE', 'SMP')
    RETURNING id`;
  check('fixtures created', true);

  // ═══ 1. SCHEDULING STILL WORKS ═════════════════════════════════════
  section('1. The lesson is the product; Google is an accessory');

  /**
   * 14:00 WITA on a fixed future date. Stated in UTC (06:00Z) so the assertion
   * below is about the conversion rather than about the machine's clock.
   */
  const startsAt = '2026-09-16T06:00:00.000Z';
  const created = await H('POST', '/sessions', {
    studentId: studentA.id,
    mentorId: mentor.id,
    programId: program.id,
    type: 'LESSON',
    startsAt,
    durationMin: 90,
    note: 'Bab 3: aljabar',
  });
  check(
    'a Head can schedule a lesson',
    created.status === 201 || created.status === 200,
    `${created.status} ${JSON.stringify(created.body?.error)}`,
  );
  sessionId = created.body?.data?.id;
  check('the lesson has an id', Boolean(sessionId));

  if (!sessionId)
    throw new Error('cannot continue without a lesson: ' + JSON.stringify(created.body));
  const [row] = await sql`SELECT * FROM sessions WHERE id = ${sessionId}::uuid`;
  check('the lesson exists whatever Google did', Boolean(row));
  check(
    'and its times are unchanged by the integration',
    new Date(row.starts_at).toISOString() === startsAt,
  );
  check(
    'the end is start + duration',
    (new Date(row.ends_at) - new Date(row.starts_at)) / 60000 === 90,
  );

  // ═══ 2. ADD TO GOOGLE CALENDAR ═════════════════════════════════════
  section('2. Add to Google Calendar, no credentials required (§13)');

  const detail = await H('GET', `/sessions/${sessionId}`);
  const link = detail.body?.data?.addToCalendarUrl;
  check('the API returns a calendar link', typeof link === 'string' && link.length > 0);

  const url = new URL(link);
  check('it points at Google Calendar', url.host === 'calendar.google.com', url.host);
  check('as a TEMPLATE action', url.searchParams.get('action') === 'TEMPLATE');

  const text = url.searchParams.get('text') ?? '';
  check(
    'the title names the lesson type, programme and student',
    text.includes('Les') && text.includes('Olimpiade Matematika') && text.includes('Anak Kalender'),
    text,
  );

  /**
   * The timezone assertion this whole feature turns on.
   *
   * 06:00Z is 14:00 WITA. Google's template takes UTC basic-format timestamps
   * and a `ctz`; if the code ever sends local wall time in the `dates` field,
   * every lesson silently moves by eight hours and no test that only checks
   * "a link exists" would notice.
   */
  const dates = url.searchParams.get('dates') ?? '';
  check('dates are UTC basic format, start/end', /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/.test(dates), dates);
  check('the start is the lesson start in UTC', dates.startsWith('20260916T060000Z'), dates);
  check('the end is 90 minutes later', dates.endsWith('20260916T073000Z'), dates);
  check(
    'the authoring timezone is WITA',
    url.searchParams.get('ctz') === 'Asia/Makassar',
    String(url.searchParams.get('ctz')),
  );

  const details = url.searchParams.get('details') ?? '';
  check('the description carries the mentor', details.includes('Mentor:'), details.slice(0, 80));
  check('and the note', details.includes('Bab 3: aljabar'));

  // ═══ 3. TIMEZONE EDGES ═════════════════════════════════════════════
  section('3. Midnight and the date boundary');

  /**
   * 16:30Z is 00:30 WITA the NEXT DAY. A lesson at half past midnight is not a
   * realistic timetable, but the conversion that gets it wrong is the same one
   * that moves an evening lesson onto the wrong date.
   */
  const midnight = await H('POST', '/sessions', {
    studentId: studentA.id,
    mentorId: mentor.id,
    type: 'CONSULTATION',
    startsAt: '2026-09-17T16:30:00.000Z',
    durationMin: 60,
  });
  const midnightId = midnight.body?.data?.id;
  check(
    'a lesson across the WITA date boundary is accepted',
    Boolean(midnightId),
    JSON.stringify(midnight.body?.error),
  );

  if (midnightId) {
    const md = await H('GET', `/sessions/${midnightId}`);
    const mu = new URL(md.body.data.addToCalendarUrl);
    check(
      'its link still carries the correct UTC instant',
      (mu.searchParams.get('dates') ?? '').startsWith('20260917T163000Z'),
      mu.searchParams.get('dates'),
    );

    /**
     * The server-side event uses zoned wall time: 00:30 on the 18th, +08:00.
     *
     * Imported from the LEAF module, and NOT behind a catch. The first version
     * imported it through `calendar.service.ts`, which pulls in `@/lib/...`
     * that only Next resolves, behind `.catch(() => null)`, so under plain
     * Node the check silently skipped itself. A real `RangeError: Invalid time
     * value` then shipped past it and only surfaced as a stuck outbox message
     * during the outage drill. A test that skips itself is worse than absent.
     */
    const { toZonedRfc3339 } = await import('../modules/scheduling/schedule-time.ts');
    {
      const zoned = toZonedRfc3339(new Date('2026-09-17T16:30:00.000Z'));
      check(
        "the same conversion accepts the driver's string form",
        toZonedRfc3339('2026-09-17T16:30:00.000Z') === zoned,
        'a timestamptz arrives as a string, not a Date',
      );
      check(
        'and the Calendar event says 00:30 on the 18th in WITA',
        zoned === '2026-09-18T00:30:00+08:00',
        zoned,
      );
    }
    await sql`DELETE FROM sessions WHERE id = ${midnightId}::uuid`;
  }

  // ═══ 4. SYNC STATE ═════════════════════════════════════════════════
  section('4. Sync state is recorded, not asserted');

  const [state] = await sql`
    SELECT gcal_sync_status::text AS status, gcal_event_id, gcal_calendar_id, gcal_sync_error
    FROM sessions WHERE id = ${sessionId}::uuid`;
  const configured = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

  if (configured) {
    check(
      'a queued lesson is PENDING or already SYNCED',
      ['PENDING', 'SYNCED'].includes(state.status),
      String(state.status),
    );
  } else {
    check(
      'with no service account, nothing claims to be synced',
      state.status !== 'SYNCED' && !state.gcal_event_id,
      `${state.status} / ${state.gcal_event_id}`,
    );
  }

  check(
    'an event id never exists without its calendar id',
    !state.gcal_event_id || Boolean(state.gcal_calendar_id),
  );

  /**
   * The constraint, not the code path: a row cannot claim SYNCED without the
   * event it claims to be synced to. Asserting the database refuses it means
   * the guarantee survives a future worker that forgets.
   */
  let claimedSyncedWithoutEvent = false;
  try {
    await sql`UPDATE sessions SET gcal_sync_status = 'SYNCED' WHERE id = ${sessionId}::uuid`;
    claimedSyncedWithoutEvent = true;
  } catch {
    /* expected when there is no event id */
  }
  if (!state.gcal_event_id) {
    check('the database refuses SYNCED without an event id', !claimedSyncedWithoutEvent);
    if (claimedSyncedWithoutEvent) {
      await sql`UPDATE sessions SET gcal_sync_status = 'PENDING' WHERE id = ${sessionId}::uuid`;
    }
  }

  // ═══ 5. IDEMPOTENCY ════════════════════════════════════════════════
  section('5. One lesson, one event (§9)');

  /**
   * The unique index is the guarantee. A worker that races itself, a QStash
   * redelivery and a cron sweep can all try to attach an event to the same
   * lesson; the database is what makes the second one lose.
   */
  const [other] = await sql`
    INSERT INTO sessions (student_id, mentor_id, type, starts_at, ends_at)
    VALUES (${studentA.id}::uuid, ${mentor.id}::uuid, 'LESSON',
            '2026-09-20T06:00:00Z'::timestamptz, '2026-09-20T07:30:00Z'::timestamptz)
    RETURNING id`;

  await sql`
    UPDATE sessions SET gcal_calendar_id = 'cal-test', gcal_event_id = 'evt-shared',
                        gcal_sync_status = 'SYNCED', gcal_synced_at = now()
    WHERE id = ${sessionId}::uuid`;

  let duplicateAccepted = false;
  try {
    await sql`
      UPDATE sessions SET gcal_calendar_id = 'cal-test', gcal_event_id = 'evt-shared',
                          gcal_sync_status = 'SYNCED', gcal_synced_at = now()
      WHERE id = ${other.id}::uuid`;
    duplicateAccepted = true;
  } catch {
    /* expected: sessions_gcal_event_uq */
  }
  check('two lessons cannot share one Google event', !duplicateAccepted);

  await sql`DELETE FROM sessions WHERE id = ${other.id}::uuid`;

  // ═══ 6. RESCHEDULE KEEPS THE SAME EVENT ════════════════════════════
  section('6. A reschedule moves the event, it does not add one (§10)');

  const moved = await H('PATCH', `/sessions/${sessionId}`, {
    startsAt: '2026-09-16T08:00:00.000Z',
  });
  check('the lesson can be moved', moved.status === 200, JSON.stringify(moved.body?.error));

  const [afterMove] = await sql`
    SELECT gcal_event_id, gcal_sync_status::text AS status, starts_at, ends_at
    FROM sessions WHERE id = ${sessionId}::uuid`;
  check(
    'the event id is unchanged by the move',
    afterMove.gcal_event_id === 'evt-shared',
    String(afterMove.gcal_event_id),
  );
  check(
    'the lesson actually moved',
    new Date(afterMove.starts_at).toISOString() === '2026-09-16T08:00:00.000Z',
  );
  check(
    'the duration is preserved',
    (new Date(afterMove.ends_at) - new Date(afterMove.starts_at)) / 60000 === 90,
  );

  const movedLink = new URL((await H('GET', `/sessions/${sessionId}`)).body.data.addToCalendarUrl);
  check(
    'and the Add-to-Calendar link moved with it',
    (movedLink.searchParams.get('dates') ?? '').startsWith('20260916T080000Z'),
    movedLink.searchParams.get('dates'),
  );

  /** Exactly one outbox message per change, all naming this session. */
  const queued = await sql`
    SELECT topic, payload FROM outbox_message
    WHERE topic LIKE 'calendar.%' AND payload->>'sessionId' = ${sessionId}`;
  if (configured) {
    check('each change queued a calendar job', queued.length >= 1, `${queued.length} queued`);
  } else {
    check(
      'nothing is queued while the integration is off',
      queued.length === 0,
      `${queued.length} queued`,
    );
  }

  // ═══ 7. CANCELLATION ═══════════════════════════════════════════════
  section('7. Cancellation keeps the record (§11)');

  const cancelled = await H('POST', `/sessions/${sessionId}/cancel`, { reason: 'Mentor sakit' });
  check(
    'the lesson can be cancelled',
    cancelled.status === 200,
    JSON.stringify(cancelled.body?.error),
  );

  const [afterCancel] = await sql`
    SELECT status::text AS status, cancel_reason, gcal_event_id FROM sessions
    WHERE id = ${sessionId}::uuid`;
  check('the application record survives', Boolean(afterCancel));
  check(
    'marked CANCELLED with its reason',
    afterCancel.status === 'CANCELLED' && afterCancel.cancel_reason === 'Mentor sakit',
  );
  check(
    'the event id is kept so the event can be found and cancelled',
    afterCancel.gcal_event_id === 'evt-shared',
  );

  // ═══ 8. AUTHORISATION ══════════════════════════════════════════════
  section('8. Only the people who may change a lesson may change its event (§15)');

  const [victim] = await sql`
    INSERT INTO sessions (student_id, mentor_id, type, starts_at, ends_at)
    VALUES (${studentA.id}::uuid, ${mentor.id}::uuid, 'LESSON',
            '2026-09-23T06:00:00Z'::timestamptz, '2026-09-23T07:30:00Z'::timestamptz)
    RETURNING id`;

  check(
    'a guardian cannot reschedule a lesson directly',
    refused(await A('PATCH', `/sessions/${victim.id}`, { startsAt: '2026-09-24T06:00:00Z' })),
  );
  check(
    'nor cancel it',
    refused(await A('POST', `/sessions/${victim.id}/cancel`, { reason: 'x' })),
  );
  check(
    'nor create one',
    refused(
      await A('POST', '/sessions', {
        studentId: studentA.id,
        mentorId: mentor.id,
        type: 'LESSON',
        startsAt: '2026-09-25T06:00:00Z',
        durationMin: 60,
      }),
    ),
  );
  check('an anonymous caller cannot read it', refused(await N('GET', `/sessions/${victim.id}`)));

  /**
   * The whole point of §15: no separate calendar endpoint exists to be an
   * unguarded back door. Sync is a consequence of a scheduling write, so it
   * inherits `session.manage` exactly.
   */
  for (const path of [`/sessions/${victim.id}/calendar`, `/schedules/${victim.id}/calendar`]) {
    const r = await A('POST', path, {});
    check(
      `no unguarded calendar endpoint at ${path}`,
      r.status === 404 || refused(r),
      `${r.status}`,
    );
  }

  // ═══ 9. CROSS-FAMILY ═══════════════════════════════════════════════
  section('9. Cross-family isolation, including the Meet link');

  await sql`UPDATE sessions SET meet_url = 'https://meet.google.com/aaa-bbbb-ccc'
            WHERE id = ${victim.id}::uuid`;

  const own = await A('GET', `/sessions/${victim.id}`);
  check("a guardian reads their own child's lesson", own.status === 200, `${own.status}`);
  check('and sees the Meet link', own.body?.data?.meetUrl?.includes('meet.google.com'));

  const foreign = await B('GET', `/sessions/${victim.id}`);
  check(
    'another family cannot read it at all',
    foreign.status === 404 || refused(foreign),
    `${foreign.status}`,
  );
  check(
    'so the Meet link cannot leak to them',
    !JSON.stringify(foreign.body ?? {}).includes('meet.google.com'),
  );

  const anonSession = await N('GET', `/sessions/${victim.id}`);
  check('and anonymous gets nothing', refused(anonSession), `${anonSession.status}`);

  const mentorRead = await M('GET', `/sessions/${victim.id}`);
  check('the assigned mentor can read it', mentorRead.status === 200, `${mentorRead.status}`);

  // ═══ 10. NO CREDENTIAL EVER LEAVES ═════════════════════════════════
  section('10. Credentials never appear in a response (§22)');

  const payloads = [
    JSON.stringify(own.body ?? {}),
    JSON.stringify((await H('GET', '/sessions?limit=50')).body ?? {}),
    JSON.stringify(detail.body ?? {}),
  ].join(' ');

  for (const needle of [
    'BEGIN PRIVATE KEY',
    'private_key',
    'GOOGLE_SERVICE_ACCOUNT',
    'client_secret',
    'refresh_token',
    'service_account',
  ]) {
    check(`no "${needle}" in any scheduling response`, !payloads.includes(needle));
  }
  check(
    'nor the calendar id',
    !process.env.GOOGLE_CALENDAR_ID || !payloads.includes(process.env.GOOGLE_CALENDAR_ID),
  );
  check(
    'nor the raw Google event id, sync STATE is what callers get',
    !payloads.includes('gcalEventId') && !payloads.includes('gcal_event_id'),
  );

  // ═══ 11. REAL GOOGLE ═══════════════════════════════════════════════
  section('11. The half that needs a real Google account');

  if (!configured) {
    block(
      'event creation against the real Calendar API',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY / GOOGLE_CALENDAR_ID are unset. ' +
        'Run `npm run verify:calendar` once configured. This suite will not fake it.',
    );
    block('Google Meet conference creation', 'same prerequisite');
  } else {
    const { syncSessionToCalendar, cancelSessionCalendarEvent } =
      await import('../modules/scheduling/calendar.service.ts');
    const [live] = await sql`
      INSERT INTO sessions (student_id, mentor_id, program_id, type, starts_at, ends_at, note)
      VALUES (${studentA.id}::uuid, ${mentor.id}::uuid, ${program.id}::uuid, 'LESSON',
              now() + interval '7 days', now() + interval '7 days 90 minutes',
              'Uji integrasi kalender')
      RETURNING id`;

    const first = await syncSessionToCalendar(live.id);
    check('a real Calendar event is created', first.status === 'SYNCED', JSON.stringify(first));
    /**
     * Meet depends on the calendar OWNER's account type, not on this code.
     *
     * A service account against a personal Google account is refused with
     * `400 "Invalid conference type value."`; the identical request against a
     * Workspace calendar succeeds. So the presence of a link is reported, and
     * what is ASSERTED is the behaviour that belongs to us: when Google refuses
     * the conference, the event is still created rather than the whole sync
     * failing over an optional extra.
     */
    if (first.status === 'SYNCED' && first.meetUrl) {
      check('with a Google Meet conference', true, first.meetUrl);
    } else {
      block(
        'Google Meet conference creation',
        'this calendar owner cannot mint Meet links (needs Google Workspace). ' +
          'The event was created without one, the intended degradation.',
      );
      check(
        'and the event is created anyway, without the conference',
        first.status === 'SYNCED' && Boolean(first.eventId),
        JSON.stringify(first),
      );
    }

    const second = await syncSessionToCalendar(live.id);
    check(
      'syncing twice does not create a second event',
      second.status === 'SYNCED' && second.eventId === first.eventId,
      `${first.eventId} vs ${second.eventId}`,
    );

    const done = await cancelSessionCalendarEvent(live.id);
    check('and the event can be cancelled', done.status === 'SYNCED', JSON.stringify(done));
    await sql`DELETE FROM sessions WHERE id = ${live.id}::uuid`;
  }

  await sql`DELETE FROM sessions WHERE id = ${victim.id}::uuid`;
} finally {
  section('Cleaning up');
  await sql`DELETE FROM outbox_message WHERE topic LIKE 'calendar.%' AND payload->>'sessionId' = ${sessionId ?? null}`;
  await sql`DELETE FROM sessions WHERE student_id IN (SELECT id FROM students WHERE slug LIKE ${`${TAG}-%`})`;
  await sql`DELETE FROM students WHERE slug LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM programs WHERE slug LIKE ${`${TAG}-%`}`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`.catch(() => {});
    await supabase.auth.admin.deleteUser(id).catch(() => {});
  }
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed${blocked ? `, ${blocked} blocked` : ''}\n`);
if (blocked) {
  console.log('Blocked checks need a Google service account, see .env.example.\n');
}
process.exit(fail === 0 ? 0 : 1);
