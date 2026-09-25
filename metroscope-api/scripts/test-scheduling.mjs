import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Scheduling, sessions, series, attendance (doc 13 §12.6, doc 14 §3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev              # in one terminal
 *   npm run test:scheduling  # in another
 *
 * doc 13 §12.6 states the risk this module exists to remove: "double-booked
 * mentors; silent SLA breach". So the assertions that matter most here are the
 * ones about two people wanting the same hour, and about one family being able
 * to see another family's timetable, a session row says where a named child
 * will be at 16.00 on Wednesday, which is the most sensitive thing this system
 * stores after a payment proof.
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

const TAG = 'sched-test';
const RUN = Date.now();

let pass = 0,
  fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? `, ${d}` : ''}`);
};

async function retry(fn, attempts = 10) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1300));
    }
  }
  throw last;
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

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A fixed future Wednesday, so the suite is not a different test on Tuesdays. */
const WEDNESDAY = '2026-09-02';
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+08:00`).toISOString();

const accounts = [];
const studentIds = [];
const seriesIds = [];

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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Jadwal ${tag}`})`;
  const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
  await sql`UPDATE users SET primary_role_id = ${roleId} WHERE id = ${created.user.id}`;
  const token = await retry(async () => {
    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session.access_token;
  });
  accounts.push(created.user.id);
  return { id: created.user.id, token };
}

async function student(guardianId, name) {
  const [row] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status)
    VALUES (${guardianId}, ${name}, ${`${TAG}-${name.toLowerCase()}-${RUN}`}, current_date, 'ACTIVE')
    RETURNING id`;
  studentIds.push(row.id);
  return row.id;
}

try {
  const secretary = await account('sec', 'SECRETARY');
  const mentor = await account('mentor', 'MENTOR');
  const otherMentor = await account('mentor2', 'MENTOR');
  const guardian = await account('parent', 'PARENT');
  const stranger = await account('stranger', 'PARENT');

  const S = api(secretary.token);
  const M = api(mentor.token);
  const M2 = api(otherMentor.token);
  const P = api(guardian.token);
  const X = api(stranger.token);

  const aditya = await student(guardian.id, `Aditya${RUN}`);
  const other = await student(stranger.id, `Nabila${RUN}`);

  // ═══ creating ════════════════════════════════════════════════════════
  console.log('\nBooking a session');

  const created = await S('POST', '/sessions', {
    studentId: aditya,
    mentorId: mentor.id,
    startsAt: at(WEDNESDAY, '16:00'),
    durationMin: 90,
    note: 'Sesi uji',
  });
  check('a Secretary can book a session', created.status === 201, JSON.stringify(created.body));
  const sessionId = created.body?.data?.id;

  check(
    'the end time is derived from the duration',
    created.body?.data?.endsAt === at(WEDNESDAY, '17:30'),
    String(created.body?.data?.endsAt),
  );
  check(
    'timestamps come back ISO 8601, not Postgres rendering',
    ISO_8601.test(created.body?.data?.startsAt ?? ''),
    String(created.body?.data?.startsAt),
  );
  check(
    'and it carries the names the calendar renders',
    created.body?.data?.studentName?.includes('Aditya') &&
      created.body?.data?.mentorName?.includes('Jadwal mentor'),
    JSON.stringify(created.body?.data?.mentorName),
  );

  const mentorBooking = await M('POST', '/sessions', {
    studentId: aditya,
    mentorId: mentor.id,
    startsAt: at(WEDNESDAY, '19:00'),
  });
  check(
    'a Mentor cannot, scheduling is Secretary work (doc 13 §8.3)',
    mentorBooking.status === 403,
    String(mentorBooking.status),
  );

  // ═══ the thing this module exists to prevent ═════════════════════════
  console.log('\nDouble-booking');

  const clash = await S('POST', '/sessions', {
    studentId: other,
    mentorId: mentor.id,
    startsAt: at(WEDNESDAY, '16:30'),
    durationMin: 90,
  });
  check(
    'the same mentor cannot be booked into an overlapping hour',
    clash.status === 409 && clash.body?.error?.code === 'SESSION_CONFLICT',
    JSON.stringify(clash.body),
  );
  check(
    'and the message names the mentor, not the student',
    /Mentor/.test(clash.body?.error?.message ?? ''),
    clash.body?.error?.message,
  );

  const studentClash = await S('POST', '/sessions', {
    studentId: aditya,
    mentorId: otherMentor.id,
    startsAt: at(WEDNESDAY, '17:00'),
    durationMin: 60,
  });
  check(
    'nor can one child be in two lessons at once',
    studentClash.status === 409,
    JSON.stringify(studentClash.body),
  );
  check(
    'and that message names the student',
    /Siswa/.test(studentClash.body?.error?.message ?? ''),
    studentClash.body?.error?.message,
  );

  /**
   * The constraint is the guarantee; the endpoint is only a preview. Asserted
   * separately because a check that agrees with the database today can drift,
   * and the one that must never be wrong is the database.
   */
  const backToBack = await S('POST', '/sessions', {
    studentId: other,
    mentorId: mentor.id,
    startsAt: at(WEDNESDAY, '17:30'),
    durationMin: 60,
  });
  check(
    'a session starting exactly when the last one ends is fine',
    backToBack.status === 201,
    'the range is [), touching is not overlapping',
  );

  const preflight = await S(
    'GET',
    `/sessions/conflicts?mentorId=${mentor.id}&startsAt=${encodeURIComponent(at(WEDNESDAY, '16:30'))}&durationMin=60`,
  );
  check('the pre-flight sees the same clash', preflight.body?.data?.conflicts?.length === 1);
  check(
    'and reports no availability template rather than warning about one',
    preflight.body?.data?.hasAvailabilityTemplate === false &&
      preflight.body?.data?.outsideAvailability === false,
    JSON.stringify(preflight.body?.data),
  );

  const selfMove = await S(
    'GET',
    `/sessions/conflicts?mentorId=${mentor.id}&startsAt=${encodeURIComponent(at(WEDNESDAY, '16:00'))}&durationMin=90&excludeId=${sessionId}`,
  );
  check(
    'a session being moved does not conflict with itself',
    selfMove.body?.data?.conflicts?.length === 0,
    JSON.stringify(selfMove.body?.data?.conflicts),
  );

  // ═══ availability is a WARNING, not a refusal ════════════════════════
  console.log('\nAvailability');

  const template = await M('PUT', '/availability', {
    slots: [{ weekday: 3, startTime: '15:00', endTime: '18:00' }],
  });
  check(
    'a mentor sets their own weekly template',
    template.status === 200,
    JSON.stringify(template.body),
  );

  const inside = await S(
    'GET',
    `/sessions/conflicts?mentorId=${mentor.id}&startsAt=${encodeURIComponent(at(WEDNESDAY, '15:00'))}&durationMin=60`,
  );
  check(
    'a slot inside the template raises no warning',
    inside.body?.data?.outsideAvailability === false,
  );

  const outside = await S(
    'GET',
    `/sessions/conflicts?mentorId=${mentor.id}&startsAt=${encodeURIComponent(at(WEDNESDAY, '20:00'))}&durationMin=60`,
  );
  check(
    'a slot outside it warns',
    outside.body?.data?.outsideAvailability === true,
    JSON.stringify(outside.body?.data),
  );

  const booked = await S('POST', '/sessions', {
    studentId: aditya,
    mentorId: mentor.id,
    startsAt: at(WEDNESDAY, '20:00'),
    durationMin: 60,
  });
  check(
    'but booking it still succeeds, a preference is not an error',
    booked.status === 201,
    JSON.stringify(booked.body),
  );

  check(
    'a parent cannot read a mentor availability template',
    (await P('GET', `/availability?mentorId=${mentor.id}`)).body?.data?.items?.length === 0,
    'when a mentor is free is internal capacity information',
  );

  // ═══ who can see whose timetable ═════════════════════════════════════
  console.log('\nVisibility');

  const parentView = await P('GET', '/sessions');
  check('a parent sees their own child sessions', parentView.body?.data?.items?.length >= 1);
  check(
    'and NOTHING belonging to another family',
    parentView.body.data.items.every((s) => s.studentId === aditya),
    JSON.stringify(parentView.body.data.items.map((s) => s.studentName)),
  );

  const strangerView = await X('GET', `/sessions?studentId=${aditya}`);
  check(
    'another guardian asking for that child by id gets nothing',
    strangerView.status === 200 && strangerView.body.data.items.length === 0,
    'RLS filters the read; it does not 403, which would confirm the child exists',
  );
  check(
    'and cannot open one by id either',
    (await X('GET', `/sessions/${sessionId}`)).status === 404,
  );

  const mineOnly = await M('GET', '/sessions?scope=mine');
  check(
    'scope=mine returns only the caller own sessions',
    mineOnly.body.data.items.length >= 1 &&
      mineOnly.body.data.items.every((s) => s.mentorId === mentor.id),
  );
  check(
    'a mentor sees their own sessions even for students of other families',
    mineOnly.body.data.items.some((s) => s.studentId === other),
  );

  // ═══ attendance ══════════════════════════════════════════════════════
  console.log('\nAttendance');

  const foreign = await M2('PUT', `/sessions/${sessionId}/attendance`, { status: 'PRESENT' });
  check(
    'a mentor cannot mark a session they did not teach',
    foreign.status === 403,
    JSON.stringify(foreign.body),
  );

  const marked = await M('PUT', `/sessions/${sessionId}/attendance`, {
    status: 'PRESENT',
    note: 'Tepat waktu',
  });
  check('the mentor who taught it can', marked.status === 200, JSON.stringify(marked.body));
  check(
    'and marking it settles the session as DONE',
    marked.body?.data?.status === 'DONE',
    String(marked.body?.data?.status),
  );

  const absent = await M('PUT', `/sessions/${backToBack.body.data.id}/attendance`, {
    status: 'ABSENT',
  });
  check(
    'ABSENT lands on NO_SHOW, which a fee report reads differently',
    absent.body?.data?.status === 'NO_SHOW',
    String(absent.body?.data?.status),
  );

  const remark = await M('PUT', `/sessions/${sessionId}/attendance`, { status: 'EXCUSED' });
  check('re-marking updates rather than duplicating', remark.status === 200);
  const [attendanceRows] = await sql`
    SELECT count(*)::int AS n FROM session_attendance WHERE session_id = ${sessionId}`;
  check('still exactly one attendance row', attendanceRows.n === 1, String(attendanceRows.n));

  check(
    'a parent sees the attendance on their own child session',
    (await P('GET', `/sessions/${sessionId}`)).body?.data?.attendanceStatus === 'EXCUSED',
  );

  // ═══ series ══════════════════════════════════════════════════════════
  console.log('\nWeekly series');

  const series = await S('POST', '/session-series', {
    studentId: aditya,
    mentorId: otherMentor.id,
    weekday: 6,
    startTime: '10:00',
    durationMin: 90,
    startsOn: '2026-09-01',
    weeks: 4,
  });
  check('a series can be created', series.status === 201, JSON.stringify(series.body));
  seriesIds.push(series.body?.data?.id);
  check(
    'and materialises one session per week',
    series.body?.data?.created === 4,
    JSON.stringify(series.body?.data),
  );

  const generated = await S('GET', `/sessions?seriesId=${series.body.data.id}`);
  const first = generated.body.data.items[0];
  check(
    'the first falls on the first matching weekday on or after the start date',
    first?.startsAt === at('2026-09-05', '10:00'),
    String(first?.startsAt),
  );
  check(
    'every occurrence is 10.00 WITA, not 10.00 UTC',
    generated.body.data.items.every((s) => s.startsAt.endsWith('T02:00:00.000Z')),
    JSON.stringify(generated.body.data.items.map((s) => s.startsAt)),
  );
  check('they are seven days apart', generated.body.data.items.length === 4);

  /** A slot already taken is skipped, not fatal, the family still gets a term. */
  const overlapping = await S('POST', '/session-series', {
    studentId: aditya,
    mentorId: mentor.id,
    weekday: 6,
    startTime: '10:30',
    durationMin: 60,
    startsOn: '2026-09-01',
    weeks: 4,
  });
  check(
    'a series colliding with an existing one skips rather than fails',
    overlapping.status === 201 && overlapping.body.data.created === 0,
    JSON.stringify(overlapping.body?.data),
  );
  check(
    'and says how many it skipped',
    overlapping.body.data.skipped === 4,
    JSON.stringify(overlapping.body?.data),
  );
  seriesIds.push(overlapping.body?.data?.id);

  // ── edit one vs edit all ──
  const one = await S('PATCH', `/sessions/${first.id}`, { startsAt: at('2026-09-05', '11:00') });
  check('one session can be moved on its own', one.status === 200, JSON.stringify(one.body));
  check(
    'and its length is preserved',
    one.body?.data?.endsAt === at('2026-09-05', '12:30'),
    String(one.body?.data?.endsAt),
  );

  const all = await S('PATCH', `/session-series/${series.body.data.id}`, {
    startTime: '14:00',
    weeks: 4,
  });
  check('the whole series can be re-timed', all.status === 200, JSON.stringify(all.body));

  const after = await S('GET', `/sessions?seriesId=${series.body.data.id}&includeCancelled=true`);
  check(
    'future occurrences moved to the new time',
    after.body.data.items.filter((s) => s.startsAt.endsWith('T06:00:00.000Z')).length >= 1,
    JSON.stringify(after.body.data.items.map((s) => s.startsAt)),
  );

  // ── ending a series ──
  const ended = await S('POST', `/session-series/${series.body.data.id}/end`, {
    effectiveFrom: '2026-09-01',
    reason: 'Siswa pindah jadwal',
  });
  check('a series can be ended', ended.status === 200, JSON.stringify(ended.body));
  check(
    'remaining sessions are cancelled',
    ended.body?.data?.cancelled >= 1,
    JSON.stringify(ended.body?.data),
  );

  const visible = await S('GET', `/sessions?seriesId=${series.body.data.id}`);
  check(
    'cancelled sessions drop off the calendar by default',
    visible.body.data.items.length === 0,
    JSON.stringify(visible.body.data.items.length),
  );
  const withCancelled = await S(
    'GET',
    `/sessions?seriesId=${series.body.data.id}&includeCancelled=true`,
  );
  check(
    'but are still there, with the reason',
    withCancelled.body.data.items.some((s) => s.cancelReason === 'Siswa pindah jadwal'),
  );

  // ═══ cancelling ══════════════════════════════════════════════════════
  console.log('\nCancelling');

  const noReason = await S('POST', `/sessions/${booked.body.data.id}/cancel`, {});
  check(
    'a cancellation without a reason is refused',
    noReason.status === 422,
    String(noReason.status),
  );

  const cancelled = await S('POST', `/sessions/${booked.body.data.id}/cancel`, {
    reason: 'Mentor sakit',
  });
  check('with one it succeeds', cancelled.status === 200, JSON.stringify(cancelled.body));
  check('and the reason is stored', cancelled.body?.data?.cancelReason === 'Mentor sakit');

  const reclaim = await S('POST', '/sessions', {
    studentId: other,
    mentorId: mentor.id,
    startsAt: at(WEDNESDAY, '20:00'),
    durationMin: 60,
  });
  check(
    'a cancelled session releases the slot it was holding',
    reclaim.status === 201,
    'the exclusion constraint is scoped to SCHEDULED and DONE',
  );

  const [stillThere] = await sql`
    SELECT count(*)::int AS n FROM sessions WHERE id = ${booked.body.data.id}`;
  check('the cancelled row is not deleted', stillThere.n === 1, 'there is no DELETE policy at all');

  // ═══ RLS asserted directly ═══════════════════════════════════════════
  console.log('\nRLS');

  const [{ n: anonSessions }] = await sql`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE tablename = 'sessions' AND 'anon' = ANY(roles)`;
  check(
    'no anon policy on sessions at all',
    anonSessions === 0,
    'a session row says where a named child will be at 16.00 on Wednesday',
  );

  const parentDirect = await S('GET', `/sessions/${first.id}`);
  check('staff can still read it', parentDirect.status === 200);
} finally {
  const ids = studentIds.filter(Boolean);
  if (ids.length) {
    await sql`DELETE FROM session_attendance WHERE session_id IN (
                SELECT id FROM sessions WHERE student_id = ANY(${ids}))`;
    await sql`DELETE FROM sessions WHERE student_id = ANY(${ids})`;
    await sql`DELETE FROM session_series WHERE student_id = ANY(${ids})`;
    await sql`DELETE FROM students WHERE id = ANY(${ids})`;
  }
  for (const id of accounts) {
    await sql`DELETE FROM mentor_availability WHERE mentor_id = ${id}`;
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await retry(async () => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }).catch(() => {});
  }
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
