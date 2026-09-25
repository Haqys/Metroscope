import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Direct access, every role, every area (§3.8 Workstream G).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run test:security-matrix
 *
 * The other suites test a module deeply. This tests the grid shallowly and
 * completely: for each of five callers and each protected area, is the answer
 * the one the permission matrix says it should be, asked of the HTTP API
 * directly, with a real token, never through a page.
 *
 * Navigation visibility proves nothing. A sidebar that omits `/finance` and an
 * API that serves `/v1/invoices` to anyone who asks is the normal shape of this
 * bug, and it is invisible to anybody clicking around.
 *
 * The expectations come from `roles` ⋈ `role_actions` ⋈ `role_pages`, the
 * source of truth doc 12 makes the roles themselves. Where a cell is asserted
 * by hand, it is because the matrix cannot express it: "own child only" is a
 * statement about rows, not about verbs.
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

const TAG = 'secmatrix';
const RUN = Date.now().toString().slice(-6);
let pass = 0;
let fail = 0;

const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}${!ok && d ? `, ${d}` : ''}`,
  );
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
  const email = `${TAG}-${tag}-${RUN}-${Math.floor(Math.random() * 1000)}@example.test`;
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Sec ${tag}`})`;
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

/**
 * Refused = 401 or 403. Everything else is an answer.
 *
 * 404 is deliberately NOT counted as refused: a missing row and a missing route
 * both return it, and treating it as a denial made the first version of this
 * file report `/reports/overview`, a Phase 4 endpoint that does not exist yet,
 * as correctly locked down for five roles. A route that is not there proves
 * nothing about authorisation, so routes are checked for existence first.
 */
const refused = (r) => r.status === 401 || r.status === 403;

/** How many records came back, whatever shape the endpoint returns them in. */
const count = (r) => {
  const d = r.body?.data;
  if (Array.isArray(d)) return d.length;
  if (Array.isArray(d?.items)) return d.items.length;
  return d ? 1 : 0;
};

const accounts = [];
let ids = {};

try {
  section('Setting up: five callers and one family');

  const head = await account('head', 'HEAD');
  const mentor = await account('mentor', 'MENTOR');
  const secretary = await account('sec', 'SECRETARY');
  const finance = await account('fin', 'FINANCE');
  const parentA = await account('parentA', 'PARENT');
  const parentB = await account('parentB', 'PARENT');
  accounts.push(head.id, mentor.id, secretary.id, finance.id, parentA.id, parentB.id);

  const R = {
    Head: api(head.token),
    Mentor: api(mentor.token),
    Secretary: api(secretary.token),
    Finance: api(finance.token),
    Parent: api(parentA.token),
    Anonymous: api(null),
  };

  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog-${RUN}`}, 'Matriks Keamanan', 'ACADEMIC', ARRAY['SMP'], 600000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET price_monthly = 600000 RETURNING id`;
  const [studentA] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status, level)
    VALUES (${parentA.id}, 'Anak A', ${`${TAG}-a-${RUN}`}, current_date, 'ACTIVE', 'ACTIVE', 'SMP')
    RETURNING id`;
  const [studentB] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status, level)
    VALUES (${parentB.id}, 'Anak B', ${`${TAG}-b-${RUN}`}, current_date, 'ACTIVE', 'ACTIVE', 'SMP')
    RETURNING id`;
  const [invoiceB] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date)
    VALUES (${`${TAG}-B-${RUN}`}, ${studentB.id}, 600000, '2026-08', 'MONTHLY', 'UNPAID', current_date + 7)
    RETURNING id`;
  ids = {
    program: program.id,
    studentA: studentA.id,
    studentB: studentB.id,
    invoiceB: invoiceB.id,
  };
  check('fixtures created', true);

  /**
   * Each row: [area, path, { Role: expectation }] where an expectation is
   * 'read' (an answer, with rows), 'empty' (an answer with nothing in it) or
   * 'refused' (401/403).
   *
   * **'empty' is the important one, and it is why this file was rewritten.**
   * This API does not refuse a mentor who asks for `/invoices`. It answers,
   * and RLS returns nothing. The first version asserted 403, called the 200 a
   * failure, and would have had somebody "fixing" a system that was already
   * correct. The security property is *no data*, not a particular status code;
   * asserting the code tests a design decision, asserting the rows tests the
   * boundary.
   *
   * Expectations are written out rather than generated from `role_actions`,
   * because a table generated from the grants it is testing agrees with itself
   * no matter what either one says.
   */
  const MATRIX = [
    /** A parent is answered, and RLS narrows the answer to their own children.
     *  The row identity is asserted below, a count of 1 is not the claim. */
    [
      'Student directory',
      '/students',
      {
        Head: 'read',
        Mentor: 'read',
        Secretary: 'read',
        Finance: 'read',
        Parent: 'read',
        Anonymous: 'refused',
      },
    ],
    [
      'Assessment queue',
      '/assessments',
      {
        Head: 'read',
        Mentor: 'read',
        Secretary: 'refused',
        Finance: 'refused',
        Parent: 'refused',
        Anonymous: 'refused',
      },
    ],
    [
      'Progress board',
      '/progress',
      {
        Head: 'read',
        Mentor: 'read',
        Secretary: 'refused',
        Finance: 'refused',
        Parent: 'refused',
        Anonymous: 'refused',
      },
    ],
    /** The catalogue is deliberately broad, §3.4 made it a content type with a
     *  public calendar. Entries and readiness are gated per row, below. */
    [
      'Competition catalogue',
      '/competitions',
      {
        Head: 'read',
        Mentor: 'read',
        Secretary: 'read',
        Finance: 'read',
        Parent: 'read',
        Anonymous: 'refused',
      },
    ],
    [
      'Invoices',
      '/invoices',
      {
        Head: 'read',
        Mentor: 'empty',
        Secretary: 'empty',
        Finance: 'read',
        Parent: 'empty',
        Anonymous: 'refused',
      },
    ],
    /**
     * 'answered' rather than 'read', for the same reason as the inbox below.
     *
     * These asserted that a Head SEES rows, which quietly made the suite depend
     * on the CMS having content. Emptying the database for production launch
     * turned three security checks red while every refusal in the grid still
     * passed, a test reporting a breach because the library is empty is a test
     * nobody will trust the next time it goes red.
     *
     * The security claim is unchanged and still asserted below: everyone except
     * the Head is REFUSED. What a Head can see is a CMS question.
     */
    [
      'CMS articles',
      '/site/articles',
      {
        Head: 'answered',
        Mentor: 'refused',
        Secretary: 'refused',
        Finance: 'refused',
        Parent: 'refused',
        Anonymous: 'refused',
      },
    ],
    [
      'CMS media',
      '/site/media',
      {
        Head: 'answered',
        Mentor: 'refused',
        Secretary: 'refused',
        Finance: 'refused',
        Parent: 'refused',
        Anonymous: 'refused',
      },
    ],
    /** 'answered' rather than 'read': the inbox is a work QUEUE, so a freshly
     *  created mentor legitimately has nothing in it. Asserting rows here would
     *  make the suite depend on how busy the office is. */
    [
      'Inbox',
      '/inbox',
      {
        Head: 'answered',
        Mentor: 'answered',
        Secretary: 'answered',
        Finance: 'answered',
        Parent: 'refused',
        Anonymous: 'refused',
      },
    ],
    /**
     * Filters rather than refuses, like /invoices, the property that matters
     * is ZERO ROWS for the roles that may not see leads, and that is still
     * asserted exactly. The two who may are 'answered': a business with no
     * pending registrations is a quiet week, not a broken gate.
     */
    [
      'Registrations (leads)',
      '/registrations',
      {
        Head: 'answered',
        Mentor: 'empty',
        Secretary: 'answered',
        Finance: 'empty',
        Parent: 'empty',
        Anonymous: 'refused',
      },
    ],
    /** `/users` is gated by the `/team` page, which a Secretary holds. Whether
     *  guardians appear in it is asserted separately. That is the real claim. */
    [
      'Team directory',
      '/users',
      {
        Head: 'read',
        Mentor: 'refused',
        Secretary: 'read',
        Finance: 'refused',
        Parent: 'refused',
        Anonymous: 'refused',
      },
    ],
  ];

  for (const [area, path, expectations] of MATRIX) {
    section(`${area}. GET ${path}`);

    /**
     * Prove the route exists before reading anything into the other five
     * answers. A 404 for everybody is a missing endpoint, not a locked one.
     */
    const byHead = await R.Head('GET', path);
    check(`the route exists (Head: ${byHead.status})`, byHead.status !== 404, 'no such route');

    for (const [role, want] of Object.entries(expectations)) {
      const res = await R[role]('GET', path);
      const got = refused(res)
        ? 'refused'
        : want === 'answered'
          ? 'answered'
          : count(res) > 0
            ? 'read'
            : 'empty';
      check(
        `${role.padEnd(10)} ${want}`,
        got === want,
        `got ${got} (${res.status}, ${count(res)} rows)`,
      );
    }
  }

  // ═══ ROW-LEVEL: "own child only" ═══════════════════════════════════
  section('Own child only, the part a verb cannot express');

  const A = R.Parent;

  /**
   * There is no `GET /v1/students/:id`, the 360° profile is composed from the
   * module that owns each fact (§3.6), so the family's own record is read
   * through the list and the per-student sub-routes. An earlier version of this
   * check called that route and reported the 404 as a parent being locked out
   * of their own child.
   */
  const mine = await A('GET', '/students');
  const rows = mine.body?.data?.items ?? mine.body?.data ?? [];
  check('a parent is answered by the student list', mine.status === 200, `${mine.status}`);
  check('with exactly their own children in it', rows.length === 1, `${rows.length} rows`);
  check(
    'and the row is theirs, not merely one row',
    rows[0]?.id === ids.studentA,
    `${rows[0]?.id} vs ${ids.studentA}`,
  );

  const otherInvoice = await A('GET', `/invoices/${ids.invoiceB}`);
  check(
    "not another family's invoice",
    otherInvoice.status === 404 || refused(otherInvoice),
    `${otherInvoice.status}`,
  );

  const ownProgress = await A('GET', `/students/${ids.studentA}/progress`);
  check(
    'their own child’s progress is readable',
    ownProgress.status === 200,
    `${ownProgress.status}`,
  );

  const otherProgress = await A('GET', `/students/${ids.studentB}/progress`);
  check(
    "nor another family's progress",
    otherProgress.status === 404 || refused(otherProgress),
    `${otherProgress.status}`,
  );

  const otherAssessments = await A('GET', `/students/${ids.studentB}/assessments`);
  check(
    "nor another family's assessments",
    otherAssessments.status === 404 || refused(otherAssessments) || count(otherAssessments) === 0,
    `${otherAssessments.status}, ${count(otherAssessments)} rows`,
  );

  /**
   * Writes, not just reads. A parent who can PATCH their own child's progress
   * would be able to award their own points, the read boundary holding says
   * nothing about the write boundary.
   */
  const parentWrite = await A('PATCH', `/students/${ids.studentA}/progress`, {
    updates: [{ topicId: crypto.randomUUID(), percent: 100 }],
  });
  check(
    'a parent cannot write progress even for their own child',
    refused(parentWrite),
    `${parentWrite.status}`,
  );

  const parentAssess = await A('POST', '/assessments', {
    studentId: ids.studentA,
    period: '2026-08',
    category: 'BAIK',
    criteria: [],
  });
  check('nor submit an assessment', refused(parentAssess), `${parentAssess.status}`);

  // ═══ THE TEAM DIRECTORY IS STAFF ONLY ══════════════════════════════
  section('The team directory lists staff, and only staff');

  /**
   * `/users` answers a Secretary, which looked wrong until the rows were
   * counted. `users_select` admits `app.is_staff() AND app.is_staff_account(id)`
   * and `is_staff_account` is `NOT r.is_customer`, so a colleague's extension
   * is visible and a parent's phone number is not. That is the claim; this is
   * the assertion, because the status code cannot make it.
   */
  const secUsers = await R.Secretary('GET', '/users');
  const listed = secUsers.body?.data?.items ?? secUsers.body?.data ?? [];
  const guardiansListed = listed.filter((u) => (u.roles ?? []).includes('PARENT'));
  check('a Secretary sees the staff directory', listed.length > 0, `${listed.length} accounts`);
  check(
    'and not one guardian appears in it',
    guardiansListed.length === 0,
    `${guardiansListed.length} guardian(s) exposed`,
  );

  const [{ n: totalGuardians }] = await sql`
    SELECT count(DISTINCT u.id)::int AS n FROM users u
    JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    WHERE r.is_customer`;
  check(
    'while guardians do exist to be exposed',
    totalGuardians > 0,
    `${totalGuardians} in the database, the check above is not vacuous`,
  );

  // ═══ THE AUTHORISATION MODEL IS NOT PUBLIC ═════════════════════════
  section('A guardian cannot enumerate the internal authorisation model');

  /**
   * `roles_select` is `USING (true)` on purpose, the shell resolves a role's
   * name and colour to render a chip. But `/v1/roles` composed the page
   * catalogue, the verb list and the headcount alongside it, and a parent had
   * the lot for the asking. The fields are now selected for the caller.
   */
  const rolesOf = (r) => r.body?.data?.items ?? r.body?.data ?? [];
  const headRoles = await R.Head('GET', '/roles');
  const parentRoles = await R.Parent('GET', '/roles');
  check(
    'a Head reads roles with their pages and verbs',
    rolesOf(headRoles).some((r) => (r.actions ?? []).length > 0),
  );
  check(
    'a parent still gets the role names the shell needs',
    rolesOf(parentRoles).length > 0,
    `${count(parentRoles)} roles`,
  );
  check(
    'but no page catalogue',
    rolesOf(parentRoles).every((r) => (r.pages ?? []).length === 0),
  );
  check(
    'no verb list',
    rolesOf(parentRoles).every((r) => (r.actions ?? []).length === 0),
  );
  check(
    'and no staff headcount',
    rolesOf(parentRoles).every((r) => !r.memberCount),
  );

  /**
   * Staff, not only guardians.
   *
   * §3.8 gated the administrative fields on `role.manage` OR the `/team` page,
   * and §3.8B opened `/settings/roles` in the browser as a Secretary: the whole
   * catalogue was there, every role's page list, permission count and
   * headcount. Closing it for customers while leaving it open one role up was
   * half a fix. The reduced payload still carries the role NAMES that `/team`
   * labels people with; only the Head's role editor needs the rest.
   */
  const secRoles = await R.Secretary('GET', '/roles');
  check(
    'a Secretary reads role names, /team labels people with them',
    rolesOf(secRoles).length > 0,
    `${count(secRoles)} roles`,
  );
  check(
    'but not the page catalogue either',
    rolesOf(secRoles).every((r) => (r.pages ?? []).length === 0),
  );
  check(
    'nor the verb list',
    rolesOf(secRoles).every((r) => (r.actions ?? []).length === 0),
  );
  check(
    'nor the headcount behind each role',
    rolesOf(secRoles).every((r) => !r.memberCount),
  );
  check(
    'and a Secretary still cannot create a role',
    refused(await R.Secretary('POST', '/roles', { code: 'NOPE', name: 'Nope' })),
  );

  // ═══ ANONYMOUS ═════════════════════════════════════════════════════
  section('Anonymous, public rules only');

  const N = R.Anonymous;
  for (const [label, path] of [
    ['students', `/students`],
    ['a specific student', `/students/${ids.studentA}`],
    ['invoices', `/invoices`],
    ['assessments', `/assessments`],
    ['progress', `/progress`],
    ['the inbox', `/inbox`],
    ['registrations', `/registrations`],
    ['users', `/users`],
    ['CMS articles', `/site/articles`],
  ]) {
    const r = await N('GET', path);
    check(`anonymous is refused ${label}`, refused(r) || r.status === 404, `${r.status}`);
  }

  for (const [label, path] of [
    ['published articles', '/public/articles'],
    ['the competition calendar', '/public/competitions'],
    ['programmes', '/public/programs'],
  ]) {
    const r = await N('GET', path);
    check(`but may read ${label}`, r.status === 200, `${r.status}`);
  }

  /**
   * The public endpoints must not become a side door to private fields. §3.7
   * asserted this for one article; this asks it of the collection.
   */
  const pubArticles = await N('GET', '/public/articles');
  const serialised = JSON.stringify(pubArticles.body ?? {});
  for (const field of [
    'consentSource',
    'consent_source',
    'studentId',
    'student_id',
    'competitionTargetId',
  ]) {
    check(`the public article list does not expose ${field}`, !serialised.includes(field));
  }

  // ═══ FORGED AND MALFORMED CREDENTIALS ══════════════════════════════
  section('Credentials that should not work');

  /**
   * Assembled at runtime rather than pasted as a literal.
   *
   * A hand-written `eyJhbGci…` in a tracked file trips `guard-secrets.mjs`,
   * which cannot tell a deliberately invalid token from a leaked one, and
   * should not try. §3.8 committed the literal and turned the guard red the
   * moment the file became tracked, because the guard only inspects tracked
   * files and the pre-commit run had seen it as untracked.
   */
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forgedToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'attacker' })}.not-a-signature`;
  const forged = api(forgedToken);
  const f1 = await forged('GET', '/students');
  check('a forged JWT is refused', f1.status === 401, `${f1.status}`);

  const empty = api('');
  const f2 = await empty('GET', '/students');
  check('an empty bearer token is refused', refused(f2), `${f2.status}`);

  /**
   * The anon key is public by design. It ships in every frontend bundle. It
   * must not be usable as a bearer token against the API.
   */
  const anonKey = api(required('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  const f3 = await anonKey('GET', '/students');
  check('the public anon key is not a credential', refused(f3), `${f3.status}`);

  const serviceKey = api(required('SUPABASE_SERVICE_ROLE_KEY'));
  const f4 = await serviceKey('GET', '/students');
  check('nor is the service role key, presented from outside', refused(f4), `${f4.status}`);

  // ═══ CRON AND JOB ENDPOINTS ════════════════════════════════════════
  section('Background jobs are not a public API');

  const JOBS = API.replace(/\/v1$/, '');
  for (const job of ['outbox-dispatch', 'backup-verify']) {
    const r = await fetch(`${JOBS}/jobs/${job}`);
    check(`/jobs/${job} refuses an unauthenticated call`, r.status === 401, `${r.status}`);
  }

  const withUserToken = await fetch(`${JOBS}/jobs/backup-verify`, {
    headers: { Authorization: `Bearer ${head.token}` },
  });
  check(
    'and a Head’s own token is not a cron secret',
    withUserToken.status === 401,
    `${withUserToken.status}`,
  );
} finally {
  section('Cleaning up');
  await sql`DELETE FROM invoices WHERE number LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM students WHERE slug LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM programs WHERE slug LIKE ${`${TAG}-%`}`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    /**
     * A test account that touched anything has an audit_log row pointing at it,
     * and the FK is RESTRICT on purpose, an audit trail whose actor can be
     * deleted is not an audit trail. Leave the row; the Auth user goes.
     */
    await sql`DELETE FROM users WHERE id = ${id}`.catch(() => {});
    await supabase.auth.admin.deleteUser(id).catch(() => {});
  }
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
