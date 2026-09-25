import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Learning materials (doc 13 §12.7, doc 14 §3.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev             # in one terminal
 *   npm run test:materials  # in another
 *
 * doc 13 §12.7 calls the current state "the entire learning-delivery promise is
 * a mock". What replaces it turns on one distinction, entitlement is not
 * consumption, and the assertions that matter are the negative ones around it:
 * a family must never read a module nobody gave them, and a DRAFT module must
 * reach nobody at all.
 *
 * The three assignment scopes are the reason this is not a join table, so each
 * is asserted end to end: named student, whole programme (reached through
 * `enrollments`), and whole school level.
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

const TAG = 'mat-test';
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
const materialIds = [];
const programIds = [];

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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Materi ${tag}`})`;
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

async function student(guardianId, name, level) {
  const [row] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, level)
    VALUES (${guardianId}, ${name}, ${`${TAG}-${name.toLowerCase()}-${RUN}`}, current_date,
            'ACTIVE', ${level}::school_level)
    RETURNING id`;
  studentIds.push(row.id);
  return row.id;
}

const YT = 'fqg-3HuDjB0';

try {
  const mentor = await account('mentor', 'MENTOR');
  const secretary = await account('sec', 'SECRETARY');
  const guardian = await account('parent', 'PARENT');
  const other = await account('other', 'PARENT');

  const M = api(mentor.token);
  const S = api(secretary.token);
  const P = api(guardian.token);
  const X = api(other.token);

  /** Aditya is SMP and enrolled; Nabila is SMA and enrolled in nothing. */
  const aditya = await student(guardian.id, `Aditya${RUN}`, 'SMP');
  const nabila = await student(other.id, `Nabila${RUN}`, 'SMA');

  const [program] = await sql`
    INSERT INTO programs (name, slug, category, levels, duration_months, cadence, price_monthly, status)
    VALUES (${`Program Materi ${RUN}`}, ${`${TAG}-prog-${RUN}`}, 'ACADEMIC', ARRAY['SMP']::school_level[],
            6, '2x/minggu', 1500000, 'PUBLISHED')
    RETURNING id`;
  programIds.push(program.id);
  await sql`
    INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
    VALUES (${aditya}, ${program.id}, current_date, 1500000)`;

  // ═══ authoring ═══════════════════════════════════════════════════════
  console.log('\nAuthoring');

  const created = await M('POST', '/materials', {
    title: `Modul 1: Aljabar Dasar ${RUN}`,
    description: 'Fondasi aljabar untuk olimpiade.',
  });
  check('a Mentor can create a material', created.status === 201, JSON.stringify(created.body));
  const materialId = created.body?.data?.id;
  materialIds.push(materialId);
  check(
    'and the slug is derived from the title',
    created.body?.data?.slug?.startsWith('modul-1-aljabar-dasar'),
    String(created.body?.data?.slug),
  );
  check('it starts as a DRAFT', created.body?.data?.status === 'DRAFT');

  const secCreate = await S('POST', '/materials', { title: 'Coba sekretaris' });
  check(
    'a Secretary cannot, material.manage is HEAD and MENTOR',
    secCreate.status === 403,
    String(secCreate.status),
  );

  const parentCreate = await P('POST', '/materials', { title: 'Coba orang tua' });
  check('nor can a guardian', parentCreate.status === 403, String(parentCreate.status));

  // ── resources ──
  const badYoutube = await M('POST', `/materials/${materialId}/resources`, {
    kind: 'YOUTUBE',
    title: 'Video',
    url: 'https://www.youtube.com/watch?v=fqg-3HuDjB0',
  });
  check(
    'a YouTube resource must be an id, not a watch URL',
    badYoutube.status === 422,
    'a full URL in an iframe src renders nothing, silently',
  );

  const video = await M('POST', `/materials/${materialId}/resources`, {
    kind: 'YOUTUBE',
    title: 'Konsep Dasar Aljabar',
    url: YT,
    durationMin: 45,
  });
  check('a valid video is added', video.status === 200, JSON.stringify(video.body));

  const pdfWithDuration = await M('POST', `/materials/${materialId}/resources`, {
    kind: 'PDF',
    title: 'Latihan',
    url: 'https://example.test/latihan.pdf',
    durationMin: 30,
  });
  check(
    'a duration on a PDF is refused, doc 06 marks it YouTube-only',
    pdfWithDuration.status === 422,
    String(pdfWithDuration.status),
  );

  const pdf = await M('POST', `/materials/${materialId}/resources`, {
    kind: 'PDF',
    title: 'Ringkasan & Latihan',
    url: 'https://example.test/latihan.pdf',
  });
  check('a PDF is added', pdf.status === 200);
  check(
    'and resources come back in order',
    pdf.body?.data?.resources?.length === 2 && pdf.body.data.resources[0].title.includes('Konsep'),
    JSON.stringify(pdf.body?.data?.resources?.map((r) => r.title)),
  );

  // ═══ the publish state ═══════════════════════════════════════════════
  console.log('\nPublish state');

  const empty = await M('POST', '/materials', { title: `Modul kosong ${RUN}` });
  materialIds.push(empty.body?.data?.id);
  const publishEmpty = await M('POST', `/materials/${empty.body.data.id}/status`, {
    status: 'PUBLISHED',
  });
  check(
    'a material with no resources cannot be published',
    publishEmpty.status === 422 && publishEmpty.body?.error?.code === 'MATERIAL_EMPTY',
    JSON.stringify(publishEmpty.body),
  );

  check(
    'a DRAFT material is invisible to the family it was assigned to',
    (await P('GET', `/materials?studentId=${aditya}`)).body.data.items.every(
      (m) => m.id !== materialId,
    ),
  );

  const published = await M('POST', `/materials/${materialId}/status`, { status: 'PUBLISHED' });
  check(
    'a material with resources publishes',
    published.status === 200,
    JSON.stringify(published.body),
  );
  check('and stamps published_at', Boolean(published.body?.data?.publishedAt));

  // ═══ entitlement ═════════════════════════════════════════════════════
  console.log('\nEntitlement, the whole point');

  check(
    'published is not enough: an unassigned material reaches nobody',
    (await P('GET', `/materials?studentId=${aditya}`)).body.data.items.every(
      (m) => m.id !== materialId,
    ),
    'assignment is what grants access, not publication',
  );

  const bothScopes = await M('POST', `/materials/${materialId}/assignments`, {
    studentId: aditya,
    level: 'SMP',
  });
  check(
    'an assignment with two scopes is refused',
    bothScopes.status === 422,
    JSON.stringify(bothScopes.body),
  );

  // ── scope 1: one named student ──
  const toStudent = await M('POST', `/materials/${materialId}/assignments`, { studentId: aditya });
  check('assigning to one student works', toStudent.status === 201, JSON.stringify(toStudent.body));

  const adityaList = await P('GET', `/materials?studentId=${aditya}`);
  check(
    'and the family can now see it',
    adityaList.body.data.items.some((m) => m.id === materialId),
  );
  check(
    'with its resources on the detail page',
    (await P('GET', `/materials/${materialId}?studentId=${aditya}`)).body?.data?.resources
      ?.length === 2,
  );

  check(
    'another family still cannot',
    (await X('GET', `/materials?studentId=${nabila}`)).body.data.items.every(
      (m) => m.id !== materialId,
    ),
  );
  check(
    'nor open it directly by id',
    (await X('GET', `/materials/${materialId}`)).status === 404,
    'RLS filters the read; the row simply is not there',
  );

  const duplicate = await M('POST', `/materials/${materialId}/assignments`, { studentId: aditya });
  check(
    'the same assignment twice is refused',
    duplicate.status === 409,
    JSON.stringify(duplicate.body),
  );

  // ── scope 2: a whole programme, reached through enrollments ──
  const byProgram = await M('POST', '/materials', { title: `Modul program ${RUN}` });
  materialIds.push(byProgram.body.data.id);
  await M('POST', `/materials/${byProgram.body.data.id}/resources`, {
    kind: 'GDRIVE',
    title: 'Slide',
    url: 'https://drive.google.com/file/d/abc/view',
  });
  await M('POST', `/materials/${byProgram.body.data.id}/status`, { status: 'PUBLISHED' });
  await M('POST', `/materials/${byProgram.body.data.id}/assignments`, { programId: program.id });

  check(
    'a programme-scoped assignment reaches an enrolled student',
    (await P('GET', `/materials?studentId=${aditya}`)).body.data.items.some(
      (m) => m.id === byProgram.body.data.id,
    ),
    'no per-student row was written, enrollments carry it',
  );
  check(
    'and nobody else',
    (await X('GET', `/materials?studentId=${nabila}`)).body.data.items.every(
      (m) => m.id !== byProgram.body.data.id,
    ),
  );

  // ── scope 3: a whole school level ──
  const byLevel = await M('POST', '/materials', { title: `Modul jenjang ${RUN}` });
  materialIds.push(byLevel.body.data.id);
  await M('POST', `/materials/${byLevel.body.data.id}/resources`, {
    kind: 'PDF',
    title: 'Lembar rumus',
    url: 'https://example.test/rumus.pdf',
  });
  await M('POST', `/materials/${byLevel.body.data.id}/status`, { status: 'PUBLISHED' });
  await M('POST', `/materials/${byLevel.body.data.id}/assignments`, { level: 'SMA' });

  check(
    'a level-scoped assignment reaches the SMA student',
    (await X('GET', `/materials?studentId=${nabila}`)).body.data.items.some(
      (m) => m.id === byLevel.body.data.id,
    ),
  );
  check(
    'and not the SMP one',
    (await P('GET', `/materials?studentId=${aditya}`)).body.data.items.every(
      (m) => m.id !== byLevel.body.data.id,
    ),
  );

  /** Withdrawing entitlement takes the module back off the family list. */
  const assignments = await M('GET', `/materials/${byLevel.body.data.id}/assignments`);
  check('staff can list who has a module', assignments.body?.data?.items?.length === 1);

  const removed = await M(
    'DELETE',
    `/materials/${byLevel.body.data.id}/assignments/${assignments.body.data.items[0].id}`,
  );
  check('and withdraw one', removed.status === 200, JSON.stringify(removed.body));
  check(
    'after which the family no longer sees the module',
    (await X('GET', `/materials?studentId=${nabila}`)).body.data.items.every(
      (m) => m.id !== byLevel.body.data.id,
    ),
  );
  await M('POST', `/materials/${byLevel.body.data.id}/assignments`, { level: 'SMA' });

  check(
    'a guardian cannot read the assignment list. It names other families',
    (await P('GET', `/materials/${materialId}/assignments`)).body?.data?.items?.length === 0,
  );

  // ═══ progress ════════════════════════════════════════════════════════
  console.log('\nProgress');

  const opened = await P('PUT', `/materials/${materialId}/progress`, {
    studentId: aditya,
    status: 'IN_PROGRESS',
  });
  check(
    'the family records that their child opened it',
    opened.status === 200,
    JSON.stringify(opened.body),
  );
  check('and it comes back on the module', opened.body?.data?.progressStatus === 'IN_PROGRESS');
  check('with an opened_at stamp', Boolean(opened.body?.data?.openedAt));

  const strangerProgress = await X('PUT', `/materials/${materialId}/progress`, {
    studentId: aditya,
    status: 'DONE',
  });
  check(
    'another family cannot write progress for this child',
    strangerProgress.status === 403,
    String(strangerProgress.status),
  );

  const mentorProgress = await M('PUT', `/materials/${materialId}/progress`, {
    studentId: aditya,
    status: 'DONE',
  });
  check(
    'and neither can a mentor, the number must describe students, not staff',
    mentorProgress.status === 403,
    String(mentorProgress.status),
  );

  const unentitled = await X('PUT', `/materials/${byLevel.body.data.id}/progress`, {
    studentId: nabila,
    status: 'DONE',
  });
  check('a student entitled by level CAN record progress', unentitled.status === 200);

  const done = await P('PUT', `/materials/${materialId}/progress`, {
    studentId: aditya,
    status: 'DONE',
  });
  check('finishing stamps completed_at', Boolean(done.body?.data?.completedAt));

  const reopened = await P('PUT', `/materials/${materialId}/progress`, {
    studentId: aditya,
    status: 'IN_PROGRESS',
  });
  const [row] = await sql`
    SELECT opened_at, completed_at FROM material_progress
    WHERE student_id = ${aditya} AND material_id = ${materialId}`;
  check(
    're-opening a finished module clears completed_at but keeps opened_at',
    row.completed_at === null && row.opened_at !== null,
    JSON.stringify(row),
  );
  check('and there is still exactly one row', reopened.status === 200);

  // ═══ engagement ══════════════════════════════════════════════════════
  console.log('\nEngagement');

  const engagement = await M('GET', `/materials/${byProgram.body.data.id}/engagement`);
  check(
    'a mentor can see who opened a module',
    engagement.status === 200,
    JSON.stringify(engagement.body),
  );
  check(
    'and it lists every ENTITLED student, not only the ones who opened it',
    engagement.body?.data?.entitled >= 1 &&
      engagement.body.data.items.some((i) => i.status === 'NOT_STARTED'),
    JSON.stringify(engagement.body?.data),
  );
  check(
    'with counts per status',
    typeof engagement.body?.data?.counts?.NOT_STARTED === 'number',
    JSON.stringify(engagement.body?.data?.counts),
  );

  check(
    'a guardian cannot open the engagement roster',
    (await P('GET', `/materials/${materialId}/engagement`)).status === 403,
    'it answers a question about other families',
  );

  // ═══ RLS asserted directly ═══════════════════════════════════════════
  console.log('\nRLS');

  const [{ n: anonPolicies }] = await sql`
    SELECT count(*)::int AS n FROM pg_policies
    WHERE tablename IN ('materials','material_resources','material_assignments','material_progress')
      AND 'anon' = ANY(roles)`;
  check(
    'no anon policy on any material table',
    anonPolicies === 0,
    'a published module is paid teaching content, not public',
  );

  const archived = await M('POST', `/materials/${byLevel.body.data.id}/status`, {
    status: 'ARCHIVED',
  });
  check('a material can be archived', archived.status === 200);
  check(
    'and drops out of the default list',
    (await X('GET', `/materials?studentId=${nabila}`)).body.data.items.every(
      (m) => m.id !== byLevel.body.data.id,
    ),
  );
  const [progressKept] = await sql`
    SELECT count(*)::int AS n FROM material_progress WHERE material_id = ${byLevel.body.data.id}`;
  check(
    'but the progress against it survives',
    progressKept.n === 1,
    'a student who studied it still studied it',
  );
} finally {
  const ids = materialIds.filter(Boolean);
  if (ids.length) {
    await sql`DELETE FROM material_progress WHERE material_id = ANY(${ids})`;
    await sql`DELETE FROM material_assignments WHERE material_id = ANY(${ids})`;
    await sql`DELETE FROM material_resources WHERE material_id = ANY(${ids})`;
    await sql`DELETE FROM audit_log WHERE entity = 'material' AND entity_id = ANY(${ids.map(String)})`;
    await sql`DELETE FROM materials WHERE id = ANY(${ids})`;
  }
  const sids = studentIds.filter(Boolean);
  if (sids.length) {
    await sql`DELETE FROM enrollments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  if (programIds.length) await sql`DELETE FROM programs WHERE id = ANY(${programIds})`;
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
