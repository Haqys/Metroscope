import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reschedule requests (doc 13 §12.6, doc 14 §3.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev              # in one terminal
 *   npm run test:reschedule  # in another
 *
 * doc 13 §12.6 names the defect in one line, "the parent submits into a void",
 * so the assertion that matters most is not that a request can be created,
 * but that it REACHES somebody: it must appear in `/inbox` for a Secretary and
 * not for a Mentor, who cannot decide it.
 *
 * The rest is about the seam between a decision and the calendar. Approving
 * moves a child's lesson, so the two must never disagree: no cancellation
 * without a replacement, no replacement without a cancellation, and no
 * double-booking created by either.
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

const TAG = 'resched-test';
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

/** Far enough out that the H-1 rule never bites by accident. */
const inDays = (days, hhmm = '16:00') => {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const date = d.toISOString().slice(0, 10);
  return new Date(`${date}T${hhmm}:00+08:00`).toISOString();
};

const accounts = [];
const studentIds = [];

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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Reschedule ${tag}`})`;
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

try {
  const secretary = await account('sec', 'SECRETARY');
  const mentor = await account('mentor', 'MENTOR');
  const guardian = await account('parent', 'PARENT');
  const stranger = await account('stranger', 'PARENT');

  const S = api(secretary.token);
  const M = api(mentor.token);
  const P = api(guardian.token);
  const X = api(stranger.token);

  const [aditya] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status)
    VALUES (${guardian.id}, ${`Aditya${RUN}`}, ${`${TAG}-aditya-${RUN}`}, current_date, 'ACTIVE')
    RETURNING id`;
  studentIds.push(aditya.id);

  const booked = await S('POST', '/sessions', {
    studentId: aditya.id,
    mentorId: mentor.id,
    startsAt: inDays(10, '16:00'),
    durationMin: 90,
  });
  const sessionId = booked.body?.data?.id;
  check('a session exists to move', booked.status === 201, JSON.stringify(booked.body));

  // ═══ asking ══════════════════════════════════════════════════════════
  console.log('\nAsking');

  const strangerAsk = await X('POST', '/reschedule-requests', {
    sessionId,
    reason: 'Coba-coba',
  });
  check(
    'another family cannot ask about this lesson',
    strangerAsk.status === 403 || strangerAsk.status === 404,
    String(strangerAsk.status),
  );

  const asked = await P('POST', '/reschedule-requests', {
    sessionId,
    reason: 'Sakit',
    note: 'Aditya demam sejak Senin.',
    preferredStartsAt: inDays(12, '16:00'),
  });
  check('the guardian can', asked.status === 201, JSON.stringify(asked.body));
  const requestId = asked.body?.data?.id;
  check('and it starts PENDING', asked.body?.data?.status === 'PENDING');

  const twice = await P('POST', '/reschedule-requests', { sessionId, reason: 'Sakit lagi' });
  check(
    'a second open request for the same lesson is refused',
    twice.status === 409 && twice.body?.error?.code === 'RESCHEDULE_PENDING',
    JSON.stringify(twice.body),
  );

  /** FR-RES-1, enforced by the API and not only by the wizard. */
  const [soon] = await sql`
    INSERT INTO sessions (student_id, mentor_id, type, starts_at, ends_at, status)
    VALUES (${aditya.id}, ${mentor.id}, 'LESSON', now() + interval '3 hours',
            now() + interval '4 hours', 'SCHEDULED')
    RETURNING id`;
  const tooLate = await P('POST', '/reschedule-requests', {
    sessionId: soon.id,
    reason: 'Mendadak',
  });
  check(
    'a request inside H-1 is refused by the API, not just the form',
    tooLate.status === 422 && tooLate.body?.error?.code === 'RESCHEDULE_TOO_LATE',
    JSON.stringify(tooLate.body),
  );

  // ═══ it reaches somebody ═════════════════════════════════════════════
  console.log('\nThe void, closed');

  const inbox = await S('GET', '/inbox?type=reschedule');
  check(
    'the request appears in the Secretary inbox',
    inbox.body?.data?.items?.some((i) => i.id === `reschedule:${requestId}`),
    JSON.stringify(inbox.body?.data?.items),
  );
  check(
    'with the lesson time in the subtitle',
    inbox.body.data.items
      .find((i) => i.id === `reschedule:${requestId}`)
      ?.subtitle?.includes('16:00'),
    JSON.stringify(inbox.body.data.items[0]?.subtitle),
  );

  const counts = await S('GET', '/inbox/counts');
  check(
    'and is counted',
    (counts.body?.data?.byType?.reschedule ?? 0) >= 1,
    JSON.stringify(counts.body?.data?.byType),
  );

  /**
   * A mentor may READ the request. It is their Wednesday, but cannot decide
   * it, so it is not work waiting on them and must not sit in their queue.
   */
  const mentorInbox = await M('GET', '/inbox?type=reschedule');
  check(
    'but NOT in the inbox of a mentor, who cannot decide it',
    (mentorInbox.body?.data?.items ?? []).length === 0,
    JSON.stringify(mentorInbox.body?.data?.items),
  );
  const mentorRead = await M('GET', `/reschedule-requests/${requestId}`);
  check(
    'though the mentor can still read it, their own lesson may move',
    mentorRead.status === 200,
    String(mentorRead.status),
  );

  check(
    'another family sees nothing',
    (await X('GET', '/reschedule-requests')).body.data.items.length === 0,
  );

  // ═══ deciding ════════════════════════════════════════════════════════
  console.log('\nDeciding');

  const mentorApprove = await M('POST', `/reschedule-requests/${requestId}/approve`, {
    startsAt: inDays(12, '16:00'),
  });
  check(
    'a mentor cannot approve, approving moves the calendar',
    mentorApprove.status === 403,
    String(mentorApprove.status),
  );

  const parentApprove = await P('POST', `/reschedule-requests/${requestId}/approve`, {
    startsAt: inDays(12, '16:00'),
  });
  check(
    'nor can the family that asked',
    parentApprove.status === 403,
    String(parentApprove.status),
  );

  /**
   * A genuine clash needs a THIRD party. The lesson being moved cannot conflict
   * with itself: approving retires the original before inserting the
   * replacement, precisely so that nudging 16.00 to 16.30 is possible.
   */
  const [other] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status)
    VALUES (${stranger.id}, ${`Nabila${RUN}`}, ${`${TAG}-nabila-${RUN}`}, current_date, 'ACTIVE')
    RETURNING id`;
  studentIds.push(other.id);
  await S('POST', '/sessions', {
    studentId: other.id,
    mentorId: mentor.id,
    startsAt: inDays(12, '09:00'),
    durationMin: 90,
  });

  const clash = await S('POST', `/reschedule-requests/${requestId}/approve`, {
    startsAt: inDays(12, '09:30'),
  });
  check(
    'approving into an hour the mentor already teaches is refused',
    clash.status === 409,
    JSON.stringify(clash.body),
  );

  const [stillPending] = await sql`
    SELECT status::text AS status FROM reschedule_requests WHERE id = ${requestId}`;
  check(
    'and the refusal leaves the request PENDING',
    stillPending.status === 'PENDING',
    stillPending.status,
  );

  const [originalIntact] = await sql`
    SELECT status::text AS status FROM sessions WHERE id = ${sessionId}`;
  check(
    'and the original lesson untouched, the whole move is one transaction',
    originalIntact.status === 'SCHEDULED',
    originalIntact.status,
  );

  /**
   * Half an hour later, on the SAME day as the original. This is the case the
   * retire-then-insert order exists for: with the original still SCHEDULED the
   * overlap guard would refuse the lesson its own slot.
   */
  const approved = await S('POST', `/reschedule-requests/${requestId}/approve`, {
    startsAt: inDays(10, '16:30'),
    note: 'Digeser setengah jam.',
  });
  check(
    'a Secretary can approve, including a nudge inside the original hour',
    approved.status === 200,
    JSON.stringify(approved.body),
  );
  check('the request is APPROVED', approved.body?.data?.status === 'APPROVED');
  check('and links the replacement', Boolean(approved.body?.data?.newSessionId));

  const [original] = await sql`
    SELECT status::text AS status, cancel_reason FROM sessions WHERE id = ${sessionId}`;
  check(
    'the original lesson is RESCHEDULED, not deleted',
    original.status === 'RESCHEDULED',
    original.status,
  );
  check('with a reason on it', Boolean(original.cancel_reason));

  const replacement = await S('GET', `/sessions/${approved.body.data.newSessionId}`);
  check(
    'the replacement exists at the approved time',
    replacement.body?.data?.startsAt === inDays(10, '16:30'),
    String(replacement.body?.data?.startsAt),
  );
  check(
    'and keeps the original length',
    new Date(replacement.body.data.endsAt) - new Date(replacement.body.data.startsAt) ===
      90 * 60 * 1000,
  );
  check(
    'and the same student and mentor',
    replacement.body.data.studentId === aditya.id && replacement.body.data.mentorId === mentor.id,
  );

  check(
    'the item leaves the inbox once decided',
    !(await S('GET', '/inbox?type=reschedule')).body.data.items.some(
      (i) => i.id === `reschedule:${requestId}`,
    ),
  );

  const again = await S('POST', `/reschedule-requests/${requestId}/approve`, {
    startsAt: inDays(14, '16:00'),
  });
  check(
    'a decided request cannot be decided twice',
    again.status === 409 && again.body?.error?.code === 'ALREADY_DECIDED',
    JSON.stringify(again.body),
  );

  /** The family may ask again about the replacement, a rejection is not a ban. */
  const second = await P('POST', '/reschedule-requests', {
    sessionId: approved.body.data.newSessionId,
    reason: 'Bentrok acara sekolah',
  });
  check(
    'a new request can be filed on the replacement',
    second.status === 201,
    JSON.stringify(second.body),
  );

  const rejected = await S('POST', `/reschedule-requests/${second.body.data.id}/reject`, {
    note: 'Mentor tidak ada slot lain minggu itu.',
  });
  check('and rejected with a reason', rejected.status === 200, JSON.stringify(rejected.body));
  check('the reason is stored', rejected.body?.data?.decisionNote?.includes('slot lain'));

  const noReason = await S('POST', `/reschedule-requests/${second.body.data.id}/reject`, {});
  check(
    'a rejection without a reason is refused',
    noReason.status === 422,
    String(noReason.status),
  );

  const [afterReject] = await sql`
    SELECT status::text AS status FROM sessions WHERE id = ${approved.body.data.newSessionId}`;
  check(
    'rejecting leaves the lesson exactly where it was',
    afterReject.status === 'SCHEDULED',
    afterReject.status,
  );

  const third = await P('POST', '/reschedule-requests', {
    sessionId: approved.body.data.newSessionId,
    reason: 'Coba lagi',
  });
  check(
    'and the family may ask again after a rejection',
    third.status === 201,
    JSON.stringify(third.body),
  );

  // ═══ withdrawing ═════════════════════════════════════════════════════
  console.log('\nWithdrawing');

  const strangerWithdraw = await X('POST', `/reschedule-requests/${third.body.data.id}/withdraw`);
  check(
    'another family cannot withdraw it',
    strangerWithdraw.status !== 200,
    String(strangerWithdraw.status),
  );

  const withdrawn = await P('POST', `/reschedule-requests/${third.body.data.id}/withdraw`);
  check('the family that asked can', withdrawn.status === 200, JSON.stringify(withdrawn.body));
  check('and it lands WITHDRAWN', withdrawn.body?.data?.status === 'WITHDRAWN');

  /**
   * The guardian holds UPDATE on their own row by policy, so the service is the
   * only thing pinning that path to PENDING → WITHDRAWN. Withdrawing something
   * already decided would be the way to reverse a decision they did not make,
   * un-approving a move that has already cancelled one lesson and created
   * another.
   */
  const undoApproved = await P('POST', `/reschedule-requests/${requestId}/withdraw`);
  check(
    'and cannot withdraw a request that was already decided',
    undoApproved.status === 409,
    JSON.stringify(undoApproved.body),
  );

  const [untouched] = await sql`
    SELECT status::text AS status FROM reschedule_requests WHERE id = ${requestId}`;
  check('the approved decision stands', untouched.status === 'APPROVED', untouched.status);

  // ═══ notification ════════════════════════════════════════════════════
  console.log('\nNotification');

  const outbox = await sql`
    SELECT topic, payload FROM outbox_message
    WHERE topic = 'notification.reschedule-decided'
      AND payload ->> 'requestId' = ${requestId}`;
  check('approving enqueues one decision email', outbox.length === 1, JSON.stringify(outbox));

  const [template] = await sql`
    SELECT code FROM notification_templates WHERE code = 'reschedule.decided'`;
  check(
    'and the template it names exists',
    Boolean(template),
    'an outbox row with no template sends nothing',
  );
} finally {
  const ids = studentIds.filter(Boolean);
  if (ids.length) {
    await sql`DELETE FROM reschedule_requests WHERE session_id IN (
                SELECT id FROM sessions WHERE student_id = ANY(${ids}))`;
    await sql`DELETE FROM session_attendance WHERE session_id IN (
                SELECT id FROM sessions WHERE student_id = ANY(${ids}))`;
    await sql`DELETE FROM sessions WHERE student_id = ANY(${ids})`;
    await sql`DELETE FROM students WHERE id = ANY(${ids})`;
  }
  for (const id of accounts) {
    await sql`DELETE FROM outbox_message WHERE payload ->> 'userId' = ${id}`;
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await retry(async () => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }).catch(() => {});
  }
  await sql`DELETE FROM outbox_message WHERE topic = 'notification.reschedule-decided'
            AND created_at > now() - interval '10 minutes'`;
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
