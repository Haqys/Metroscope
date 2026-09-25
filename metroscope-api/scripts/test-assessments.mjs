import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Assessments, coverage instead of ownership (doc 13 §12.9, doc 14 §3.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev                # in one terminal
 *   npm run test:assessments   # in another
 *
 * doc 13 §12.9 names the defect: doc 12 §9.1 removed mentor→student ownership
 * and "no one is accountable for a student being assessed". The assertions that
 * matter are therefore about the rows that are NOT there, a coverage queue is
 * only worth anything if an unassessed child appears in it.
 *
 * The rest is the boundary. An assessment scores a child out of ten and quotes
 * a mentor on their weaknesses; it is the most private thing this product
 * stores, and the negative assertions here are the ones to read.
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

const TAG = 'asm-test';
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Asm ${tag}`})`;
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

/** WITA YYYY-MM, the same answer the service and `app.assessment_period()` give. */
const periodOf = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit' })
    .format(d)
    .slice(0, 7);
const NOW = periodOf(new Date());
const shift = (months) => {
  const [y, m] = NOW.split('-').map(Number);
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
const LAST_MONTH = shift(-1);
const SIX_MONTHS_AGO = shift(-6);

const SCORES = { UNDERSTANDING: 9, PARTICIPATION: 8, DISCIPLINE: 9, READINESS: 7 };
const NOTE = 'Pemahaman aljabar sudah kuat; perlu latihan soal cerita sebelum OSK bulan depan.';

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

  /**
   * Four students, one per coverage state the queue must distinguish:
   *   Aditya, never assessed
   *   Bagus, last assessed six months ago
   *   Citra, assessed last month
   *   Dewi, assessed THIS month (the only "Selesai")
   * plus Eka, PAUSED, who must not be in the matrix at all.
   */
  const aditya = await student(guardian.id, `Aditya${RUN}`);
  const bagus = await student(guardian.id, `Bagus${RUN}`);
  const citra = await student(other.id, `Citra${RUN}`);
  const dewi = await student(other.id, `Dewi${RUN}`);
  const eka = await student(other.id, `Eka${RUN}`, 'PAUSED');

  /** Seeded directly: the history has to predate this run to be history. */
  async function seedAssessment(studentId, period, scores = SCORES) {
    const [a] = await sql`
      INSERT INTO assessments (student_id, mentor_id, period, note, points_awarded)
      VALUES (${studentId}, ${mentor.id}, ${period}, ${NOTE}, 120)
      RETURNING id`;
    for (const [criterion, score] of Object.entries(scores)) {
      await sql`
        INSERT INTO assessment_criteria (assessment_id, criterion, score)
        VALUES (${a.id}, ${criterion}::assessment_criterion, ${score})`;
    }
    return a.id;
  }

  await seedAssessment(bagus.id, SIX_MONTHS_AGO);
  await seedAssessment(citra.id, LAST_MONTH);
  const dewiAssessment = await seedAssessment(dewi.id, NOW);

  // ═══ the derived score ═══════════════════════════════════════════════
  console.log('\nDerived score and category');

  const [derived] = await sql`
    SELECT avg_score::text AS "avgScore", category::text AS category
    FROM assessments WHERE id = ${dewiAssessment}`;
  check(
    'the average is computed by the database, not the caller',
    derived.avgScore === '8.3',
    `(9+8+9+7)/4 = 8.25 → 8.3, got ${derived.avgScore}`,
  );
  check(
    'and the category band comes with it',
    derived.category === 'BAIK',
    `8.3 is >= 7.5 and < 9.0, got ${derived.category}`,
  );

  await sql`
    UPDATE assessment_criteria SET score = 10
    WHERE assessment_id = ${dewiAssessment}`;
  const [recomputed] = await sql`
    SELECT avg_score::text AS "avgScore", category::text AS category
    FROM assessments WHERE id = ${dewiAssessment}`;
  check(
    'correcting a criterion recomputes the headline score',
    recomputed.avgScore === '10.0' && recomputed.category === 'SANGAT_BAIK',
    `${recomputed.avgScore} / ${recomputed.category}, a stale average on a report a parent read is the failure`,
  );
  await sql`
    UPDATE assessment_criteria SET score = 7
    WHERE assessment_id = ${dewiAssessment} AND criterion = 'READINESS'`;
  await sql`
    UPDATE assessment_criteria SET score = 9
    WHERE assessment_id = ${dewiAssessment} AND criterion IN ('UNDERSTANDING','DISCIPLINE')`;
  await sql`
    UPDATE assessment_criteria SET score = 8
    WHERE assessment_id = ${dewiAssessment} AND criterion = 'PARTICIPATION'`;

  // ═══ database invariants ═════════════════════════════════════════════
  console.log('\nDatabase invariants');

  let dup = 'no error';
  try {
    await sql`
      INSERT INTO assessments (student_id, mentor_id, period, note)
      VALUES (${dewi.id}, ${mentor.id}, ${NOW}, ${NOTE})`;
  } catch (e) {
    dup = e.code;
  }
  check(
    'one assessment per student per period',
    dup === '23505',
    `${dup}, the coverage matrix is student × period, so a second row is the same row`,
  );

  let dupCriterion = 'no error';
  try {
    await sql`
      INSERT INTO assessment_criteria (assessment_id, criterion, score)
      VALUES (${dewiAssessment}, 'UNDERSTANDING'::assessment_criterion, 5)`;
  } catch (e) {
    dupCriterion = e.code;
  }
  check('the same criterion twice is unrepresentable', dupCriterion === '23505', dupCriterion);

  let badScore = 'no error';
  try {
    await sql`
      INSERT INTO assessment_criteria (assessment_id, criterion, score)
      VALUES (${dewiAssessment}, 'READINESS'::assessment_criterion, 11)`;
  } catch (e) {
    badScore = e.code;
  }
  check('a score above 10 is refused, the scale is /10 (FR-ASV-0)', badScore === '23514', badScore);

  let badPeriod = 'no error';
  try {
    await sql`
      INSERT INTO assessments (student_id, mentor_id, period, note)
      VALUES (${aditya.id}, ${mentor.id}, 'Agustus 2026', ${NOTE})`;
  } catch (e) {
    badPeriod = e.code;
  }
  check('a period that is not YYYY-MM is refused', badPeriod === '23514', badPeriod);

  let ghostStudent = 'no error';
  try {
    await sql`
      INSERT INTO assessments (student_id, mentor_id, period, note)
      VALUES (${crypto.randomUUID()}, ${mentor.id}, ${NOW}, ${NOTE})`;
  } catch (e) {
    ghostStudent = e.code;
  }
  check('an assessment cannot reference a student who does not exist', ghostStudent === '23503');

  /**
   * BOTH gates, and the first draft of this assertion tested neither.
   *
   * It expected 42501 and got nothing, because RLS refuses a DELETE the way it
   * refuses a SELECT, by matching zero rows, silently, with a 200. The grant
   * layer was supposed to be the loud gate and was not: Supabase's default ACL
   * had already given `authenticated` DELETE on every table, so 0025's
   * `GRANT SELECT, INSERT, UPDATE` added nothing. 0025 now REVOKEs it, and this
   * asserts the property rather than the mechanism, the row survives either way.
   */
  let noDelete = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: mentor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`DELETE FROM assessments WHERE id = ${dewiAssessment}`;
    });
  } catch (e) {
    noDelete = e.code;
  }
  const [stillThere] = await sql`
    SELECT count(*)::int AS n FROM assessments WHERE id = ${dewiAssessment}`;
  check(
    'nobody can delete an assessment, no grant expresses it',
    stillThere.n === 1,
    `${noDelete}, a report a family already read, and points_awarded would leave a hole`,
  );
  check(
    'and the grant layer says so loudly rather than filtering to zero rows',
    noDelete === '42501',
    `${noDelete}. RLS alone would refuse this silently, with a 200`,
  );

  // ═══ the coverage queue ══════════════════════════════════════════════
  console.log('\nCoverage queue (FR-ASN-1)');

  const queue = await M('GET', '/assessments');
  check('a Mentor can read the queue', queue.status === 200, JSON.stringify(queue.body?.error));

  const rows = queue.body?.data?.items ?? [];
  const find = (id) => rows.find((r) => r.studentId === id);
  check(
    'a student who has NEVER been assessed is in it',
    find(aditya.id)?.status === 'PENDING' && find(aditya.id)?.monthsSinceLastAssessment === null,
    'the rows that are missing are the entire point of a coverage queue',
  );
  check(
    'so is one whose last assessment was six months ago',
    find(bagus.id)?.status === 'PENDING' && find(bagus.id)?.monthsSinceLastAssessment === 6,
    JSON.stringify(find(bagus.id)),
  );
  check(
    'and one assessed last month but not this one',
    find(citra.id)?.status === 'PENDING' && find(citra.id)?.monthsSinceLastAssessment === 1,
    JSON.stringify(find(citra.id)),
  );
  check(
    'a student assessed THIS period reads DONE',
    find(dewi.id)?.status === 'DONE' && find(dewi.id)?.assessmentId,
    JSON.stringify(find(dewi.id)),
  );
  check(
    'a PAUSED student is not in the matrix at all',
    !find(eka.id),
    'FR-ASN-1 says every ACTIVE student',
  );
  check(
    'the DONE row carries the score and who wrote it',
    typeof find(dewi.id)?.avgScore === 'number' && find(dewi.id)?.assessorName?.includes('mentor'),
    JSON.stringify({ avg: find(dewi.id)?.avgScore, by: find(dewi.id)?.assessorName }),
  );
  check(
    'and the programme context the UI renders',
    'programNames' in (find(dewi.id) ?? {}),
    'so the queue needs no second fixture to say what a student studies',
  );

  /** Ordering: never-assessed, then longest gap, then recent, then done. */
  const mine = rows.filter((r) => [aditya.id, bagus.id, citra.id, dewi.id].includes(r.studentId));
  check(
    'most urgent first, never assessed, then longest gap, then DONE last',
    mine[0]?.studentId === aditya.id &&
      mine[1]?.studentId === bagus.id &&
      mine[2]?.studentId === citra.id &&
      mine[3]?.studentId === dewi.id,
    JSON.stringify(mine.map((r) => r.studentName)),
  );

  const pendingOnly = await M('GET', '/assessments?status=pending');
  check(
    'the Belum Dinilai tab excludes the assessed',
    pendingOnly.body.data.items.every((r) => r.status === 'PENDING'),
  );
  const doneOnly = await M('GET', '/assessments?status=done');
  check(
    'and the Selesai tab excludes the rest',
    doneOnly.body.data.items.every((r) => r.status === 'DONE'),
  );
  check(
    'the coverage summary does NOT move when the list is filtered',
    pendingOnly.body.data.summary.total === queue.body.data.summary.total &&
      pendingOnly.body.data.summary.done === queue.body.data.summary.done,
    'FR-ASN-6 puts this number in front of the Head, a filter must not change it',
  );

  const searched = await M('GET', `/assessments?q=Aditya${RUN}`);
  check(
    'search narrows the list',
    searched.body.data.items.length === 1 && searched.body.data.items[0].studentId === aditya.id,
  );
  const noResults = await M('GET', '/assessments?q=zzz-nobody-zzz');
  check(
    'and returns nothing rather than everything when it misses',
    noResults.body.data.items.length === 0,
  );

  const past = await M('GET', `/assessments?period=${SIX_MONTHS_AGO}`);
  check(
    'an earlier period is a different matrix',
    past.body.data.items.find((r) => r.studentId === bagus.id)?.status === 'DONE' &&
      past.body.data.items.find((r) => r.studentId === dewi.id)?.status === 'PENDING',
    'coverage is a PERIOD question. That is the boundary with §3.6',
  );

  // ═══ who may read the queue ══════════════════════════════════════════
  console.log('\nWho may read the queue');

  check(
    'a Head can, doc 13 §8.3 gives them the page',
    (await H('GET', '/assessments')).status === 200,
  );
  check(
    'a Secretary cannot, despite holding /students and student.edit',
    (await S('GET', '/assessments')).status === 403,
    'an evaluation of a child is not administrative data',
  );
  check('a guardian cannot', (await P('GET', '/assessments')).status === 403);
  check('and an anonymous caller cannot', (await ANON('GET', '/assessments')).status === 401);

  // ═══ claiming ════════════════════════════════════════════════════════
  console.log('\nClaiming (FR-ASN-2)');

  const claim = await M('POST', '/assessments/claims', { studentId: aditya.id });
  check(
    'a Mentor can claim an un-assessed student',
    claim.status === 201,
    JSON.stringify(claim.body),
  );

  const claimAgain = await M2('POST', '/assessments/claims', { studentId: aditya.id });
  check(
    'a second mentor cannot take a live claim',
    claimAgain.status === 409 && claimAgain.body?.error?.code === 'CLAIMED_BY_OTHER',
    JSON.stringify(claimAgain.body),
  );

  const blocked = await M2('POST', '/assessments', {
    studentId: aditya.id,
    scores: SCORES,
    note: NOTE,
  });
  check(
    'and cannot write past it either, the lock has teeth at the write',
    blocked.status === 409 && blocked.body?.error?.code === 'CLAIMED_BY_OTHER',
    JSON.stringify(blocked.body),
  );

  /**
   * A claim made 25 hours ago. Both columns move, because
   * `assessment_claims_expiry_after_claim` refuses a row that is born expired,
   * which it should, and which caught this simulation being written the lazy
   * way the first time.
   */
  await sql`
    UPDATE assessment_claims
    SET claimed_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
    WHERE student_id = ${aditya.id}`;
  const takeover = await M2('POST', '/assessments/claims', { studentId: aditya.id });
  check(
    'an EXPIRED claim can be taken over. It is a soft lock',
    takeover.status === 201,
    'a mentor on leave must not block a child from being assessed',
  );

  const released = await M('DELETE', `/assessments/claims/${aditya.id}`);
  check('any mentor may release any claim', released.status === 200, JSON.stringify(released.body));
  check(
    'releasing a claim that is not there is a 404',
    (await M('DELETE', `/assessments/claims/${aditya.id}`)).status === 404,
  );

  const parentClaim = await P('POST', '/assessments/claims', { studentId: aditya.id });
  check('a guardian cannot claim their own child', parentClaim.status === 403);

  // ═══ submitting ══════════════════════════════════════════════════════
  console.log('\nSubmitting (FR-ASN-5)');

  const submitted = await M('POST', '/assessments', {
    studentId: aditya.id,
    scores: SCORES,
    note: NOTE,
  });
  check('a Mentor can submit', submitted.status === 201, JSON.stringify(submitted.body));
  const adityaAssessment = submitted.body?.data?.id;
  check(
    'the average and category came back derived, not echoed',
    submitted.body?.data?.avgScore === 8.3 && submitted.body?.data?.category === 'BAIK',
    JSON.stringify(submitted.body?.data),
  );
  check(
    'and the points FR-ASV-5 shows the family',
    submitted.body?.data?.pointsAwarded === 120,
    String(submitted.body?.data?.pointsAwarded),
  );

  const [attributed] = await sql`
    SELECT mentor_id AS "mentorId" FROM assessments WHERE id = ${adityaAssessment}`;
  check(
    'the author is the caller, not whoever the body named',
    attributed.mentorId === mentor.id,
    'assessments_insert pins mentor_id = app.current_user_id()',
  );

  const again = await M('POST', '/assessments', {
    studentId: aditya.id,
    scores: SCORES,
    note: NOTE,
  });
  check(
    'submitting twice for the same period is refused',
    again.status === 409 && again.body?.error?.code === 'ALREADY_ASSESSED',
    JSON.stringify(again.body),
  );

  const shortNote = await M('POST', '/assessments', {
    studentId: bagus.id,
    scores: SCORES,
    note: 'bagus',
  });
  check(
    'a five-character note is refused. FR-ASN-4 asks for a qualitative note',
    shortNote.status === 422,
    String(shortNote.status),
  );

  const missingCriterion = await M('POST', '/assessments', {
    studentId: bagus.id,
    scores: { UNDERSTANDING: 8, PARTICIPATION: 8, DISCIPLINE: 8 },
    note: NOTE,
  });
  check('three of four criteria is refused', missingCriterion.status === 422);

  const extraCriterion = await M('POST', '/assessments', {
    studentId: bagus.id,
    scores: { ...SCORES, VIBES: 10 },
    note: NOTE,
  });
  check('and a fifth criterion is refused, the set is closed', extraCriterion.status === 422);

  const outOfRange = await M('POST', '/assessments', {
    studentId: bagus.id,
    scores: { ...SCORES, READINESS: 42 },
    note: NOTE,
  });
  check('a score of 42 out of 10 is refused', outOfRange.status === 422);

  const ghost = await M('POST', '/assessments', {
    studentId: crypto.randomUUID(),
    scores: SCORES,
    note: NOTE,
  });
  check('a student who does not exist is refused', ghost.status === 422, String(ghost.status));

  // ═══ who may write ═══════════════════════════════════════════════════
  console.log('\nWho may write');

  const secWrite = await S('POST', '/assessments', {
    studentId: bagus.id,
    scores: SCORES,
    note: NOTE,
  });
  check(
    'a Secretary cannot submit. They hold student.edit, not assessment.submit',
    secWrite.status === 403,
    String(secWrite.status),
  );
  const parentWrite = await P('POST', '/assessments', {
    studentId: aditya.id,
    scores: SCORES,
    note: NOTE,
  });
  check('nor can a guardian, for their own child', parentWrite.status === 403);
  check(
    'nor an anonymous caller',
    (await ANON('POST', '/assessments', { studentId: aditya.id, scores: SCORES, note: NOTE }))
      .status === 401,
  );

  const otherMentorEdit = await M2('PATCH', `/assessments/${adityaAssessment}`, {
    note: 'Saya ubah catatan kolega saya tentang anak ini, tanpa bicara dengan siapa pun.',
  });
  check(
    'another mentor cannot rewrite this one',
    otherMentorEdit.status === 403,
    'disagreeing with an evaluation is a conversation, not an edit',
  );
  const headEdit = await H('PATCH', `/assessments/${adityaAssessment}`, {
    note: 'Ketua mengubah kata-kata mentor tentang seorang anak, diam-diam.',
  });
  check('and neither can the Head, who holds every verb', headEdit.status === 403);

  const authorEdit = await M('PATCH', `/assessments/${adityaAssessment}`, {
    scores: { ...SCORES, READINESS: 9 },
  });
  check('the author can correct it', authorEdit.status === 200, JSON.stringify(authorEdit.body));
  check(
    'and the correction moves the derived average',
    authorEdit.body?.data?.avgScore === 8.8,
    `(9+8+9+9)/4 = 8.75 → 8.8, got ${authorEdit.body?.data?.avgScore}`,
  );

  // ═══ what a family may see ═══════════════════════════════════════════
  console.log('\nWhat a family may see');

  const own = await P('GET', `/students/${aditya.slug}/assessments`);
  check(
    'a guardian reads their own child’s assessments',
    own.status === 200,
    JSON.stringify(own.body?.error),
  );
  check(
    'with the criteria, the note and the mentor',
    own.body?.data?.items?.[0]?.scores?.UNDERSTANDING === 9 &&
      own.body.data.items[0].note === NOTE &&
      own.body.data.items[0].assessorName,
    JSON.stringify(own.body?.data?.items?.[0]),
  );

  const notOwn = await P('GET', `/students/${citra.slug}/assessments`);
  check(
    "another family's child is a 404, not an empty list",
    notOwn.status === 404,
    'saying "exists but not yours" still says it exists',
  );

  const anonRead = await ANON('GET', `/students/${aditya.slug}/assessments`);
  check('an anonymous caller gets nothing', anonRead.status === 401);

  const mentorRead = await M('GET', `/students/${aditya.slug}/assessments`);
  check(
    'a Mentor reads the same payload for the form',
    mentorRead.status === 200 && mentorRead.body?.data?.current?.id === adityaAssessment,
    JSON.stringify(mentorRead.body?.data?.current),
  );
  check(
    'including the PREVIOUS period, which is what a mentor wants beside the form',
    (await M('GET', `/students/${citra.slug}/assessments`)).body?.data?.previous?.period ===
      LAST_MONTH,
    'the current period is empty for Citra, the last one is not',
  );

  // ═══ the family's reply ══════════════════════════════════════════════
  console.log('\nThe family’s reply (FR-ASV-4)');

  const reacted = await P('POST', `/assessments/${adityaAssessment}/reaction`, {
    reaction: 'HELPFUL',
  });
  check('a guardian can thank the mentor', reacted.status === 200, JSON.stringify(reacted.body));

  const changed = await P('POST', `/assessments/${adityaAssessment}/reaction`, {
    reaction: 'MOTIVATING',
  });
  const [reactionRows] = await sql`
    SELECT count(*)::int AS n FROM assessment_reactions WHERE assessment_id = ${adityaAssessment}`;
  check(
    'changing their mind replaces it rather than stacking',
    changed.status === 200 && reactionRows.n === 1,
    String(reactionRows.n),
  );

  const strangerReact = await X('POST', `/assessments/${adityaAssessment}/reaction`, {
    reaction: 'THANKS',
  });
  check("another family cannot react to this child's assessment", strangerReact.status === 403);

  const mentorReact = await M('POST', `/assessments/${adityaAssessment}/reaction`, {
    reaction: 'HELPFUL',
  });
  check(
    'and the mentor cannot react to their own work',
    mentorReact.status === 403,
    'it would make the number describe the staff rather than the families',
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
    (tx) => tx`SELECT id FROM assessments WHERE student_id = ${citra.id}`,
  );
  check(
    'a guardian selects zero rows for another family’s child',
    crossFamily.length === 0,
    'RLS denies a READ by returning no rows, not by raising',
  );

  const secRead = await asUser(secretary.id, (tx) => tx`SELECT id FROM assessments`);
  check('a Secretary selects zero assessments', secRead.length === 0, String(secRead.length));

  let forgery = 'no error';
  try {
    await asUser(
      mentor2.id,
      (tx) =>
        tx`INSERT INTO assessments (student_id, mentor_id, period, note)
         VALUES (${bagus.id}, ${mentor.id}, ${NOW}, ${NOTE})`,
    );
  } catch (e) {
    forgery = e.code;
  }
  check(
    'a mentor cannot file an assessment under a colleague’s name',
    forgery === '42501',
    `${forgery}. RLS denies a WRITE by raising`,
  );

  let parentInsert = 'no error';
  try {
    await asUser(
      guardian.id,
      (tx) =>
        tx`INSERT INTO assessments (student_id, mentor_id, period, note)
         VALUES (${aditya.id}, ${guardian.id}, ${shift(1)}, ${NOTE})`,
    );
  } catch (e) {
    parentInsert = e.code;
  }
  check('a guardian cannot write an assessment at all', parentInsert === '42501', parentInsert);

  const parentClaims = await asUser(guardian.id, (tx) => tx`SELECT * FROM assessment_claims`);
  check(
    'and reads no claims, who is about to assess is team scheduling',
    parentClaims.length === 0,
    String(parentClaims.length),
  );

  const [{ n: anonGrants }] = await sql`
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_name IN ('assessments','assessment_criteria','assessment_claims','assessment_reactions')`;
  check(
    'anon holds no grant on anything in this module',
    anonGrants === 0,
    'the most private thing this product stores',
  );

  // ═══ the notification ════════════════════════════════════════════════
  console.log('\nThe parent is told (FR-ASN-5)');

  const [queued] = await sql`
    SELECT count(*)::int AS n FROM outbox_message
    WHERE topic = 'notification.assessment-ready'
      AND payload->>'assessmentId' = ${adityaAssessment}`;
  check('submitting enqueues the parent notification', queued.n === 1, String(queued.n));

  const [tmpl] = await sql`
    SELECT count(*)::int AS n FROM notification_templates WHERE code = 'assessment.ready'`;
  check('and the template it renders exists', tmpl.n === 1, 'seed.mjs carries it');

  // ═══ the empty case ══════════════════════════════════════════════════
  console.log('\nThe empty case');

  const emptyPeriod = await M('GET', '/assessments?period=1999-01');
  check(
    'a period nobody was assessed in is all PENDING, not an error',
    emptyPeriod.status === 200 && emptyPeriod.body.data.items.every((r) => r.status === 'PENDING'),
  );
  check(
    'and its coverage is 0%, not null',
    emptyPeriod.body.data.summary.done === 0 && emptyPeriod.body.data.summary.coveragePct === 0,
    JSON.stringify(emptyPeriod.body.data.summary),
  );
} finally {
  const sids = studentIds.filter(Boolean);
  if (sids.length) {
    await sql`DELETE FROM outbox_message WHERE topic = 'notification.assessment-ready'
              AND (payload->>'assessmentId')::uuid IN (SELECT id FROM assessments WHERE student_id = ANY(${sids}))`;
    await sql`DELETE FROM notifications WHERE entity_type = 'assessment'
              AND entity_id IN (SELECT id::text FROM assessments WHERE student_id = ANY(${sids}))`;
    await sql`DELETE FROM assessment_claims WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM assessments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  await sql`DELETE FROM audit_log WHERE entity IN ('assessment')`;
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
