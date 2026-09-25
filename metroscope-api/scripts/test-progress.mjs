import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Progress, the staleness board (doc 03 FR-UPD-1/2, doc 14 §3.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev             # in one terminal
 *   npm run test:progress   # in another
 *
 * The threshold is fourteen calendar days, doc 13 §7.2's *"belum diupdate 14
 * hari"*, and the assertions below pin the BOUNDARY, not a vibe: 13 days is
 * current, 14 days is stale, and never-updated is its own state rather than
 * "very stale".
 *
 * Every timestamp here is planted at an exact age in WITA, because the rule is
 * calendar-based: a student updated at 23:00 and read at 08:00 fourteen
 * mornings later has let fourteen days pass, whatever the elapsed milliseconds
 * say.
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

const TAG = 'prg-test';
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

const accounts = [];
const studentIds = [];
const programIds = [];
const topicIds = [];

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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Prg ${tag}`})`;
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

async function student(guardianId, name, status = 'ACTIVE') {
  const [row] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, level, student_status)
    VALUES (${guardianId}, ${name}, ${`${TAG}-${name.toLowerCase()}-${RUN}`}, current_date,
            'ACTIVE', 'SMP'::school_level, ${status}::student_status)
    RETURNING id, slug`;
  studentIds.push(row.id);
  return row;
}

/**
 * Plant a progress row at an exact age in WITA calendar days.
 *
 * Midday WITA on the target date, so the row cannot land on either side of a
 * midnight boundary by accident and make the assertion below flaky.
 */
async function plant(studentId, topicId, percent, daysAgo, mentorId) {
  await sql`
    INSERT INTO progress (student_id, topic_id, percent, updated_by_id, updated_at)
    VALUES (${studentId}, ${topicId}, ${percent}, ${mentorId},
            ((now() AT TIME ZONE 'Asia/Makassar')::date - ${daysAgo}::int
              + time '12:00') AT TIME ZONE 'Asia/Makassar')
    ON CONFLICT (student_id, topic_id) DO UPDATE
      SET percent = EXCLUDED.percent, updated_at = EXCLUDED.updated_at`;
}

try {
  const mentor = await account('mentor', 'MENTOR');
  const mentor2 = await account('mentor2', 'MENTOR');
  const head = await account('head', 'HEAD');
  const secretary = await account('sec', 'SECRETARY');
  const guardian = await account('parent', 'PARENT');
  const other = await account('other', 'PARENT');

  const M = api(mentor.token);
  const M2 = api(mentor2.token);
  const H = api(head.token);
  const S = api(secretary.token);
  const P = api(guardian.token);
  const X = api(other.token);
  const ANON = api(null);

  // ── a programme with a syllabus ────────────────────────────────────
  const [program] = await sql`
    INSERT INTO programs (name, slug, category, levels, duration_months, cadence, price_monthly, status)
    VALUES (${`Program Progress ${RUN}`}, ${`${TAG}-prog-${RUN}`}, 'ACADEMIC',
            ARRAY['SMP']::school_level[], 6, '2x/minggu', 1500000, 'PUBLISHED')
    RETURNING id`;
  programIds.push(program.id);

  const [otherProgram] = await sql`
    INSERT INTO programs (name, slug, category, levels, duration_months, cadence, price_monthly, status)
    VALUES (${`Program Lain ${RUN}`}, ${`${TAG}-prog2-${RUN}`}, 'NON_ACADEMIC',
            ARRAY['SMP']::school_level[], 6, '1x/minggu', 900000, 'PUBLISHED')
    RETURNING id`;
  programIds.push(otherProgram.id);

  // ═══ topics. FR-UPD-2's prerequisite ════════════════════════════════
  console.log('\nTopics (the write half that never existed)');

  const created = await M('POST', '/topics', { programId: program.id, name: 'Aljabar Dasar' });
  check('a Mentor can create a topic', created.status === 201, JSON.stringify(created.body));
  const aljabar = created.body?.data?.id;
  topicIds.push(aljabar);

  const t2 = await M('POST', '/topics', {
    programId: program.id,
    name: 'Geometri',
    orderIndex: 10,
  });
  const geometri = t2.body?.data?.id;
  topicIds.push(geometri);

  const t3 = await M('POST', '/topics', { programId: otherProgram.id, name: 'Debat Parlementer' });
  const debat = t3.body?.data?.id;
  topicIds.push(debat);

  check(
    'a Secretary cannot, topic CRUD is material.manage',
    (await S('POST', '/topics', { programId: program.id, name: 'Coba' })).status === 403,
  );
  check(
    'nor can a guardian',
    (await P('POST', '/topics', { programId: program.id, name: 'Coba' })).status === 403,
  );

  const renamed = await M('PATCH', `/topics/${geometri}`, { name: 'Geometri Bidang' });
  check(
    'a topic can be renamed',
    renamed.status === 200 && renamed.body?.data?.name === 'Geometri Bidang',
    JSON.stringify(renamed.body),
  );

  // ── students, enrolled ─────────────────────────────────────────────
  const aditya = await student(guardian.id, `Aditya${RUN}`);
  const bagus = await student(guardian.id, `Bagus${RUN}`);
  const citra = await student(other.id, `Citra${RUN}`);
  const dewi = await student(other.id, `Dewi${RUN}`);
  const eka = await student(other.id, `Eka${RUN}`, 'PAUSED');

  for (const s of [aditya, bagus, citra, dewi, eka]) {
    await sql`
      INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
      VALUES (${s.id}, ${program.id}, current_date, 1500000)`;
  }

  /**
   * Four students, planted at the exact ages the boundary turns on:
   *   Aditya, never touched
   *   Bagus, 40 days ago   (stale, oldest)
   *   Citra, 14 days ago   (stale, exactly ON the boundary)
   *   Dewi, 13 days ago   (current, one day inside it)
   * plus Eka, PAUSED, who must not appear at all.
   */
  await plant(bagus.id, aljabar, 40, 40, mentor.id);
  await plant(citra.id, aljabar, 55, 14, mentor.id);
  await plant(dewi.id, aljabar, 60, 13, mentor.id);
  await plant(eka.id, aljabar, 70, 99, mentor.id);

  // ═══ the rule, in the database ═══════════════════════════════════════
  console.log('\nThe staleness rule (FR-UPD-1 · doc 13 "belum diupdate 14 hari")');

  const [threshold] = await sql`SELECT app.progress_stale_days() AS days`;
  check('the threshold is fourteen days', threshold.days === 14, String(threshold.days));

  const [states] = await sql`
    SELECT app.progress_status(NULL) AS never,
           app.progress_status(((now() AT TIME ZONE 'Asia/Makassar')::date - 13 + time '12:00')
             AT TIME ZONE 'Asia/Makassar') AS d13,
           app.progress_status(((now() AT TIME ZONE 'Asia/Makassar')::date - 14 + time '12:00')
             AT TIME ZONE 'Asia/Makassar') AS d14,
           app.progress_status(((now() AT TIME ZONE 'Asia/Makassar')::date - 15 + time '12:00')
             AT TIME ZONE 'Asia/Makassar') AS d15`;
  check('never updated is NEVER, not "very stale"', states.never === 'NEVER', states.never);
  check('13 days is CURRENT. One day inside the boundary', states.d13 === 'CURRENT', states.d13);
  check('14 days is STALE, the boundary itself', states.d14 === 'STALE', states.d14);
  check('15 days is STALE', states.d15 === 'STALE', states.d15);

  const [calendar] = await sql`
    SELECT app.days_since_wita(((now() AT TIME ZONE 'Asia/Makassar')::date - 14 + time '23:30')
             AT TIME ZONE 'Asia/Makassar') AS late,
           app.days_since_wita(((now() AT TIME ZONE 'Asia/Makassar')::date - 14 + time '00:30')
             AT TIME ZONE 'Asia/Makassar') AS early`;
  check(
    'the count is CALENDAR days, not elapsed milliseconds',
    calendar.late === 14 && calendar.early === 14,
    `23:30 → ${calendar.late}, 00:30 → ${calendar.early}: both are the same day on the wall`,
  );

  // ═══ the board ═══════════════════════════════════════════════════════
  console.log('\nThe board');

  const board = await M('GET', '/progress');
  check('a Mentor can read it', board.status === 200, JSON.stringify(board.body?.error));
  check(
    'and it reports the rule rather than the UI restating it',
    board.body?.data?.staleAfterDays === 14,
    String(board.body?.data?.staleAfterDays),
  );

  const rows = board.body?.data?.items ?? [];
  const find = (id) => rows.find((r) => r.studentId === id);

  check(
    'a student with no progress row at all is NEVER',
    find(aditya.id)?.status === 'NEVER' && find(aditya.id)?.daysSinceUpdate === null,
    JSON.stringify(find(aditya.id)),
  );
  check(
    '40 days is STALE',
    find(bagus.id)?.status === 'STALE' && find(bagus.id)?.daysSinceUpdate === 40,
    JSON.stringify(find(bagus.id)),
  );
  check(
    'exactly 14 days is STALE',
    find(citra.id)?.status === 'STALE' && find(citra.id)?.daysSinceUpdate === 14,
    JSON.stringify(find(citra.id)),
  );
  check(
    '13 days is CURRENT',
    find(dewi.id)?.status === 'CURRENT' && find(dewi.id)?.daysSinceUpdate === 13,
    JSON.stringify(find(dewi.id)),
  );
  check('a PAUSED student is not on the board', !find(eka.id), 'the board is ACTIVE students');
  check(
    'the row carries who last touched it',
    find(bagus.id)?.lastUpdatedBy?.includes('mentor'),
    String(find(bagus.id)?.lastUpdatedBy),
  );
  check(
    'and the programme context, without a second fixture',
    find(bagus.id)?.programNames?.includes('Program Progress'),
    String(find(bagus.id)?.programNames),
  );

  const mine = rows.filter((r) => [aditya.id, bagus.id, citra.id, dewi.id].includes(r.studentId));
  check(
    'ordered NEVER first, then longest silence',
    mine[0]?.studentId === aditya.id &&
      mine[1]?.studentId === bagus.id &&
      mine[2]?.studentId === citra.id &&
      mine[3]?.studentId === dewi.id,
    JSON.stringify(mine.map((r) => `${r.studentName}:${r.status}:${r.daysSinceUpdate}`)),
  );

  const staleOnly = await M('GET', '/progress?status=stale');
  check(
    'the stale filter returns only stale students',
    staleOnly.body.data.items.every((r) => r.status === 'STALE') &&
      staleOnly.body.data.items.some((r) => r.studentId === citra.id),
  );
  const neverOnly = await M('GET', '/progress?status=never');
  check(
    'and the never filter only the never-updated',
    neverOnly.body.data.items.every((r) => r.status === 'NEVER'),
  );
  check(
    'the summary does NOT move when the list is filtered',
    staleOnly.body.data.summary.total === board.body.data.summary.total &&
      staleOnly.body.data.summary.stale === board.body.data.summary.stale,
    'the banner counts the roll, not the filter',
  );

  const searched = await M('GET', `/progress?q=Bagus${RUN}`);
  check(
    'search narrows the list',
    searched.body.data.items.length === 1 && searched.body.data.items[0].studentId === bagus.id,
  );
  check(
    'and a miss returns nothing rather than everything',
    (await M('GET', '/progress?q=zzz-nobody-zzz')).body.data.items.length === 0,
  );

  // ═══ who may read the board ══════════════════════════════════════════
  console.log('\nWho may read the board');

  check(
    'a Head can, doc 13 §8.3 gives them the page',
    (await H('GET', '/progress')).status === 200,
  );
  check(
    'a Secretary cannot, despite student.edit',
    (await S('GET', '/progress')).status === 403,
    'a percentage per topic is a teaching judgement, not roster admin',
  );
  check('a guardian cannot', (await P('GET', '/progress')).status === 403);
  check('an anonymous caller cannot', (await ANON('GET', '/progress')).status === 401);

  // ═══ the detail page ═════════════════════════════════════════════════
  console.log('\nOne student');

  const detail = await M('GET', `/students/${aditya.slug}/progress`);
  check(
    'a Mentor opens a student by slug',
    detail.status === 200,
    JSON.stringify(detail.body?.error),
  );
  check(
    'the topic list comes from the ACTIVE enrolment, not from every topic in the database',
    detail.body.data.topics.length === 2 &&
      detail.body.data.topics.every((t) => t.topicId !== debat),
    JSON.stringify(detail.body.data.topics.map((t) => t.topicName)),
  );
  check(
    'an untouched topic is percent: null, not 0',
    detail.body.data.topics.every((t) => t.percent === null),
    '"not yet assessed" and "assessed at zero" are different statements about a child',
  );
  check('and the state says NEVER', detail.body.data.state?.status === 'NEVER');

  const missing = await M('GET', '/students/tidak-ada-siswa-ini/progress');
  check('a student who does not exist is a 404', missing.status === 404);

  // ═══ updating ════════════════════════════════════════════════════════
  console.log('\nUpdating (FR-UPD-2)');

  const saved = await M('PATCH', `/students/${aditya.slug}/progress`, {
    entries: [
      { topicId: aljabar, percent: 80 },
      { topicId: geometri, percent: 60 },
    ],
  });
  check('a Mentor updates two sliders', saved.status === 200, JSON.stringify(saved.body));
  check(
    'the state comes back CURRENT with the average',
    saved.body.data.state?.status === 'CURRENT' && saved.body.data.state?.overallPercent === 70,
    JSON.stringify(saved.body.data.state),
  );

  const [attributed] = await sql`
    SELECT updated_by_id AS "by" FROM progress
    WHERE student_id = ${aditya.id} AND topic_id = ${aljabar}`;
  check(
    'attributed to the caller, not to whoever the body named',
    attributed.by === mentor.id,
    'progress_insert pins updated_by_id = app.current_user_id()',
  );

  const partial = await M('PATCH', `/students/${aditya.slug}/progress`, {
    entries: [{ topicId: aljabar, percent: 85 }],
  });
  check('one slider can move on its own', partial.status === 200);
  const [untouched] = await sql`
    SELECT percent FROM progress WHERE student_id = ${aditya.id} AND topic_id = ${geometri}`;
  check(
    'and the topic that was not sent keeps its value',
    untouched.percent === 60,
    `${untouched.percent}, a partial save must not silently zero what was off screen`,
  );

  const outOfRange = await M('PATCH', `/students/${aditya.slug}/progress`, {
    entries: [{ topicId: aljabar, percent: 140 }],
  });
  check('140% is refused', outOfRange.status === 422);

  const empty = await M('PATCH', `/students/${aditya.slug}/progress`, { entries: [] });
  check(
    'an empty save is refused. It would reset the clock for nothing',
    empty.status === 422,
    String(empty.status),
  );

  const dupTopic = await M('PATCH', `/students/${aditya.slug}/progress`, {
    entries: [
      { topicId: aljabar, percent: 10 },
      { topicId: aljabar, percent: 90 },
    ],
  });
  check('the same topic twice in one body is refused', dupTopic.status === 422);

  const notEnrolled = await M('PATCH', `/students/${aditya.slug}/progress`, {
    entries: [{ topicId: debat, percent: 50 }],
  });
  check(
    'a topic from a programme the student is not enrolled in is refused',
    notEnrolled.status === 422 && notEnrolled.body?.error?.code === 'TOPIC_NOT_ENROLLED',
    JSON.stringify(notEnrolled.body),
  );

  const ghostStudent = await M('PATCH', `/students/${crypto.randomUUID()}/progress`, {
    entries: [{ topicId: aljabar, percent: 50 }],
  });
  check('an unknown student is a 404', ghostStudent.status === 404);

  const afterUpdate = await M('GET', '/progress');
  check(
    'the board moved: the updated student is now CURRENT',
    afterUpdate.body.data.items.find((r) => r.studentId === aditya.id)?.status === 'CURRENT',
  );
  check(
    'and the students nobody touched did not move',
    afterUpdate.body.data.items.find((r) => r.studentId === citra.id)?.daysSinceUpdate === 14 &&
      afterUpdate.body.data.items.find((r) => r.studentId === bagus.id)?.daysSinceUpdate === 40,
  );

  // ═══ who may write ═══════════════════════════════════════════════════
  console.log('\nWho may write');

  check(
    'a Secretary cannot, student.edit is not progress.edit',
    (
      await S('PATCH', `/students/${aditya.slug}/progress`, {
        entries: [{ topicId: aljabar, percent: 5 }],
      })
    ).status === 403,
  );
  check(
    'nor can a guardian, for their own child',
    (
      await P('PATCH', `/students/${aditya.slug}/progress`, {
        entries: [{ topicId: aljabar, percent: 100 }],
      })
    ).status === 403,
  );
  check(
    'nor an anonymous caller',
    (
      await ANON('PATCH', `/students/${aditya.slug}/progress`, {
        entries: [{ topicId: aljabar, percent: 100 }],
      })
    ).status === 401,
  );

  const secondMentor = await M2('PATCH', `/students/${aditya.slug}/progress`, {
    entries: [{ topicId: geometri, percent: 75 }],
  });
  check(
    'ANY mentor may update ANY student, doc 12 §9.1 removed ownership',
    secondMentor.status === 200,
    'narrowing this would quietly reinstate the model the client rejected, and the board exists because there is none',
  );

  // ═══ what a family may see ═══════════════════════════════════════════
  console.log('\nWhat a family may see');

  const own = await P('GET', `/students/${aditya.slug}/progress`);
  check('a guardian reads their own child', own.status === 200, JSON.stringify(own.body?.error));
  check(
    'with the per-topic percentages',
    own.body.data.topics.find((t) => t.topicId === aljabar)?.percent === 85,
    JSON.stringify(own.body.data.topics),
  );
  check(
    'and the updater name, which a join on users could not give them',
    typeof own.body.data.state?.lastUpdatedBy === 'string' &&
      own.body.data.state.lastUpdatedBy.length > 0,
    String(own.body.data.state?.lastUpdatedBy),
  );
  check(
    "another family's child is a 404, not an empty payload",
    (await P('GET', `/students/${citra.slug}/progress`)).status === 404,
    'saying "exists but not yours" still says it exists',
  );
  check(
    'and an anonymous caller gets nothing',
    (await ANON('GET', `/students/${aditya.slug}/progress`)).status === 401,
  );

  // ═══ RLS, directly ═══════════════════════════════════════════════════
  console.log('\nRLS, without the API in the way');

  const asUser = (userId, fn) =>
    sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      return fn(tx);
    });

  const crossFamily = await asUser(
    guardian.id,
    (tx) => tx`SELECT id FROM progress WHERE student_id = ${citra.id}`,
  );
  check(
    'a guardian selects zero rows for another family',
    crossFamily.length === 0,
    'RLS denies a READ by returning no rows',
  );
  check(
    'a Secretary selects zero progress rows',
    (await asUser(secretary.id, (tx) => tx`SELECT id FROM progress`)).length === 0,
  );

  let forgery = 'no error';
  try {
    await asUser(
      mentor2.id,
      (tx) =>
        tx`INSERT INTO progress (student_id, topic_id, percent, updated_by_id)
         VALUES (${bagus.id}, ${geometri}, 99, ${mentor.id})`,
    );
  } catch (e) {
    forgery = e.code;
  }
  check(
    'a mentor cannot attribute an update to a colleague',
    forgery === '42501',
    `${forgery}. RLS denies a WRITE by raising`,
  );

  let parentWrite = 'no error';
  try {
    await asUser(
      guardian.id,
      (tx) => tx`UPDATE progress SET percent = 100 WHERE student_id = ${aditya.id}`,
    );
  } catch (e) {
    parentWrite = e.code;
  }
  const [survived] = await sql`
    SELECT percent FROM progress WHERE student_id = ${aditya.id} AND topic_id = ${aljabar}`;
  check(
    'a guardian cannot inflate their own child’s progress',
    survived.percent === 85,
    `${survived.percent} after ${parentWrite}, the property is that the row is unchanged`,
  );

  // ═══ grants, not just policies ═══════════════════════════════════════
  console.log('\nGrants (the §3.5 lesson)');

  let deleted = 'no error';
  try {
    await asUser(mentor.id, (tx) => tx`DELETE FROM progress WHERE student_id = ${aditya.id}`);
  } catch (e) {
    deleted = e.code;
  }
  const [stillThere] = await sql`
    SELECT count(*)::int AS n FROM progress WHERE student_id = ${aditya.id}`;
  check(
    'nobody can delete a progress row',
    stillThere.n === 2,
    `${stillThere.n} left after ${deleted}`,
  );
  check(
    'and the grant layer says so loudly, not by matching zero rows',
    deleted === '42501',
    `${deleted}. RLS alone would refuse this silently, with a 200`,
  );

  const [{ n: anonGrants }] = await sql`
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_name = 'progress'`;
  check('anon holds no grant on progress at all', anonGrants === 0, String(anonGrants));

  const [{ n: deleteGrants }] = await sql`
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_name = 'progress'
      AND privilege_type IN ('DELETE', 'TRUNCATE')`;
  check(
    'and authenticated holds neither DELETE nor TRUNCATE',
    deleteGrants === 0,
    String(deleteGrants),
  );

  // ═══ topic deletion protects recorded work ══════════════════════════
  console.log('\nRetiring a topic');

  const inUse = await M('DELETE', `/topics/${aljabar}`);
  check(
    'a topic somebody has been scored on cannot be deleted',
    inUse.status === 409 && inUse.body?.error?.code === 'TOPIC_IN_USE',
    JSON.stringify(inUse.body),
  );
  const unusedTopic = await M('POST', '/topics', { programId: program.id, name: 'Belum Dipakai' });
  topicIds.push(unusedTopic.body?.data?.id);
  check(
    'an unused one can',
    (await M('DELETE', `/topics/${unusedTopic.body.data.id}`)).status === 200,
  );

  // ═══ the empty case ══════════════════════════════════════════════════
  console.log('\nThe empty case');

  const noTopics = await M('GET', `/students/${citra.slug}/progress`);
  check(
    'a student whose programme has topics still lists them',
    noTopics.status === 200 && noTopics.body.data.topics.length >= 1,
  );
  const emptyFilter = await M('GET', '/progress?status=current&q=zzz-nobody');
  check(
    'a filter matching nobody returns an empty list, not an error',
    emptyFilter.status === 200 && emptyFilter.body.data.items.length === 0,
  );
} finally {
  const sids = studentIds.filter(Boolean);
  if (sids.length) {
    await sql`DELETE FROM progress WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM enrollments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  const tids = topicIds.filter(Boolean);
  if (tids.length) await sql`DELETE FROM topics WHERE id = ANY(${tids})`;
  if (programIds.length) await sql`DELETE FROM programs WHERE id = ANY(${programIds})`;
  await sql`DELETE FROM audit_log WHERE entity IN ('topic')`;
  for (const id of accounts) {
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
