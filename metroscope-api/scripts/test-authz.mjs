import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Roles as data, end to end, integration tests (doc 14 Task 0.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * Doc 14's exit criterion is one sentence: a Mentor requesting
 * `/v1/invoices/:id/verify` gets 403 from the action guard AND 0 rows from RLS.
 * Both halves matter. Either alone would pass while the other was broken, and
 * the broken one is the one that lets something through.
 *
 * The rest of this file is about the mechanism doc 12 §1 promises and the
 * product did not have: a role invented at runtime that actually persists, with
 * exactly the pages and verbs it was given.
 *
 *   npm run dev        # in one terminal
 *   npm run test:authz # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const anon = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const TAG = 'authz-test';
const CUSTOM_CODE = `TEST_LOMBA_${Date.now().toString().slice(-6)}`;
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
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last;
}

async function account(tag, roleCode) {
  const email = `${TAG}-${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Authz ${tag}`})`;
  if (roleCode) {
    const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
    await sql`UPDATE users SET primary_role_id = ${roleId} WHERE id = ${created.user.id}`;
  }
  const signIn = async () => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session.access_token;
  };
  return { id: created.user.id, email, token: await retry(signIn), signIn };
}

const api =
  (token) =>
  async (method, path, body, headers = {}) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

/** POST /users is idempotent, so every invite carries a key. */
const key = () => ({ 'Idempotency-Key': crypto.randomUUID() });

const accounts = [];
let customRoleId;
let invoiceId;

try {
  const head = await account('head', 'HEAD');
  const mentor = await account('mentor', 'MENTOR');
  const secretary = await account('sec', 'SECRETARY');
  const guardian = await account('parent', 'PARENT');
  accounts.push(head.id, mentor.id, secretary.id, guardian.id);

  const H = api(head.token);
  const M = api(mentor.token);
  const S = api(secretary.token);
  const P = api(guardian.token);

  // ── The exit criterion ─────────────────────────────────────────────
  console.log('\nExit criterion, a Mentor cannot verify a payment');

  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog`}, 'Authz Test', 'ACADEMIC', ARRAY['SMP'], 600000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET price_monthly = 600000 RETURNING id`;
  const [student] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status)
    VALUES (${guardian.id}, ${`${TAG} Anak`}, ${`${TAG}-${crypto.randomUUID().slice(0, 8)}`},
            CURRENT_DATE, 'ACTIVE', 'ACTIVE')
    RETURNING id`;
  await sql`INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
            VALUES (${student.id}, ${program.id}, CURRENT_DATE, 600000)`;
  const [inv] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date,
                          proof_key, proof_uploaded_at)
    VALUES (app.next_invoice_number(), ${student.id}, 600000, ${`${TAG}-p`}, 'MONTHLY',
            'AWAITING_VERIFICATION', CURRENT_DATE, 'proofs/x.jpg', now())
    RETURNING id`;
  invoiceId = inv.id;

  const mentorVerify = await M('POST', `/invoices/${invoiceId}/verify`, { method: 'TRANSFER' });
  check(
    'Gate 2 (action guard): 403 FORBIDDEN',
    mentorVerify.status === 403 && mentorVerify.body?.error?.code === 'FORBIDDEN',
    `${mentorVerify.status} ${JSON.stringify(mentorVerify.body?.error)}`,
  );

  /**
   * Gate 3, proven independently of the API. If the action guard were the only
   * thing standing in the way, a bug in `handler()` would be a payment system
   * with no authorisation at all.
   */
  const rlsRows = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: mentor.id, role: 'authenticated' })}, true)`;
    await tx`SET LOCAL ROLE authenticated`;
    return tx`SELECT id FROM invoices WHERE id = ${invoiceId}`;
  });
  check('Gate 3 (RLS): 0 rows for the same Mentor', rlsRows.length === 0, `${rlsRows.length} rows`);

  const mentorList = await M('GET', '/invoices');
  check(
    'and the list endpoint returns nothing rather than 403',
    mentorList.status === 200 && (mentorList.body?.data?.items ?? []).length === 0,
    `${mentorList.status} n=${(mentorList.body?.data?.items ?? []).length}`,
  );

  /**
   * ─────────────────────────────────────────────────────────────────
   *  A guardian is not staff, however many roles they hold.
   * ─────────────────────────────────────────────────────────────────
   *
   * `app.is_staff()` was "holds any role at all", documented on the premise
   * that customers have no `user_roles` row. `convertLead` assigns PARENT to
   * every guardian it creates, so that premise was false and every customer
   * was staff to RLS, which reaches `programs`, `topics`, `activity_event`
   * and `notification_templates`, all gated on the same predicate.
   *
   * Asserted against the database directly, because the API layer would mask
   * it: this is about what the policies believe, not what a route allows.
   */
  console.log('\nA guardian holds PARENT and is still not staff');

  const [{ n: unpublished }] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-secret`}, 'Belum terbit', 'ACADEMIC', ARRAY['SMP'], 900000, 'DRAFT')
    ON CONFLICT (slug) DO UPDATE SET status = 'DRAFT'
    RETURNING 1 AS n`;
  check('an unpublished programme exists to test against', unpublished === 1);

  const asGuardian = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: guardian.id, role: 'authenticated' })}, true)`;
    await tx`SET LOCAL ROLE authenticated`;
    const staff = await tx`SELECT app.is_staff() AS s`;
    const roles =
      await tx`SELECT count(*)::int AS n FROM user_roles WHERE user_id = ${guardian.id}`;
    const progs = await tx`SELECT count(*)::int AS n FROM programs WHERE is_published = false`;
    return { staff: staff[0].s, roleRows: roles[0].n, unpublishedVisible: progs[0].n };
  });

  check('the guardian really does hold a role row', asGuardian.roleRows >= 1);
  check('yet app.is_staff() is false', asGuardian.staff === false, String(asGuardian.staff));
  check(
    'and unpublished programmes stay invisible',
    asGuardian.unpublishedVisible === 0,
    `${asGuardian.unpublishedVisible} visible`,
  );

  const parentRole = (await sql`SELECT is_customer FROM roles WHERE code = 'PARENT'`)[0];
  check('PARENT is flagged as a customer role', parentRole?.is_customer === true);

  // ── Roles are readable data ────────────────────────────────────────
  console.log('\nRoles are data the API serves');
  const roles = await M('GET', '/roles');
  check('any signed-in account can read roles', roles.status === 200, `got ${roles.status}`);
  const head_ = (roles.body?.data ?? []).find((r) => r.code === 'HEAD');
  check(
    'roles carry pages and actions',
    Array.isArray(head_?.pages) && Array.isArray(head_?.actions),
  );
  check('roles carry display data for chips', !!head_?.name && !!head_?.home);
  check('system roles are flagged', head_?.isSystem === true);
  check('and report how many accounts hold them', typeof head_?.memberCount === 'number');

  const mentorCreate = await M('POST', '/roles', {
    code: 'SNEAKY',
    name: 'Sneaky',
    home: '/home',
    pages: ['/home'],
    actions: ['payment.verify'],
  });
  check(
    'a Mentor cannot create a role (403)',
    mentorCreate.status === 403,
    `got ${mentorCreate.status}`,
  );

  // ── A custom role, invented at runtime ─────────────────────────────
  console.log('\nA custom role persists and grants exactly what it says');

  const created = await H('POST', '/roles', {
    code: CUSTOM_CODE,
    name: 'Admin Lomba Uji',
    description: 'Role custom untuk tes.',
    home: '/competitions',
    tone: 'bg-rose-50 text-rose-700 ring-rose-200/70',
    pages: ['/home', '/inbox', '/competitions'],
    // data.export, deliberately: MENTOR already holds session.manage, so
    // asserting on that verb would pass whether or not this role granted it.
    actions: ['data.export'],
  });
  check('the Head creates it (201)', created.status === 201, `got ${created.status}`);
  customRoleId = created.body?.data?.id;
  check('it is not a system role', created.body?.data?.isSystem === false);

  const persisted = await sql`SELECT code FROM roles WHERE code = ${CUSTOM_CODE}`;
  check('it is in the database, not in React state', persisted.length === 1);

  const dupe = await H('POST', '/roles', {
    code: CUSTOM_CODE,
    name: 'Duplikat',
    home: '/home',
    pages: ['/home'],
  });
  check('a duplicate code is refused 409', dupe.status === 409, `got ${dupe.status}`);

  const badHome = await H('POST', '/roles', {
    code: `${CUSTOM_CODE}_X`,
    name: 'Rumah salah',
    home: '/finance',
    pages: ['/home'],
  });
  check(
    'a home page outside the grants is refused 422',
    badHome.status === 422,
    `got ${badHome.status}`,
  );

  const badVerb = await H('POST', '/roles', {
    code: `${CUSTOM_CODE}_Y`,
    name: 'Verb palsu',
    home: '/home',
    pages: ['/home'],
    actions: ['invoice.print_money'],
  });
  check('an unknown verb is refused 422', badVerb.status === 422, `got ${badVerb.status}`);

  // ── Assigning it takes effect immediately ──────────────────────────
  console.log('\nAssignment takes effect on the next request, not the next login');

  const assign = await H('PUT', `/users/${mentor.id}/roles`, {
    roles: ['MENTOR', CUSTOM_CODE],
    primaryRole: CUSTOM_CODE,
  });
  check(
    'the Head assigns it',
    assign.status === 200,
    `${assign.status} ${JSON.stringify(assign.body?.error)}`,
  );

  /** Same token as before, grants come from the database, not the JWT. */
  const meAfter = await M('GET', '/auth/me');
  check(
    'the SAME token now carries the custom role',
    (meAfter.body?.data?.roles ?? []).includes(CUSTOM_CODE),
    JSON.stringify(meAfter.body?.data?.roles),
  );
  check('and the page it granted', (meAfter.body?.data?.pages ?? []).includes('/competitions'));
  check('and the verb it granted', (meAfter.body?.data?.actions ?? []).includes('data.export'));
  check(
    'but NOT a verb it never had',
    !(meAfter.body?.data?.actions ?? []).includes('payment.verify'),
  );

  /**
   * The reason `roleDetails` exists. Without it every frontend keeps a copy of
   * the role table to turn a code into a label, and a role invented five
   * minutes ago is not in anybody's copy.
   */
  const detail = (meAfter.body?.data?.roleDetails ?? []).find((r) => r.code === CUSTOM_CODE);
  check('/auth/me returns display data for the custom role', detail?.name === 'Admin Lomba Uji');
  check('including its landing page', detail?.home === '/competitions');
  check('including its chip colour', typeof detail?.tone === 'string' && detail.tone.length > 0);

  const stillNoMoney = await M('POST', `/invoices/${invoiceId}/verify`, { method: 'TRANSFER' });
  check(
    'the custom role still cannot verify payments',
    stillNoMoney.status === 403,
    `got ${stillNoMoney.status}`,
  );

  // ── Editing grants ─────────────────────────────────────────────────
  console.log('\nEditing a role changes what its holders may do');

  const grantMore = await H('PATCH', `/roles/${customRoleId}`, {
    pages: ['/home', '/inbox', '/competitions', '/schedule'],
  });
  check('the Head adds a page', grantMore.status === 200, `got ${grantMore.status}`);
  const meWider = await M('GET', '/auth/me');
  check(
    'the holder gains it without re-authenticating',
    (meWider.body?.data?.pages ?? []).includes('/schedule'),
  );

  const revoke = await H('PATCH', `/roles/${customRoleId}`, { actions: [] });
  check('the Head revokes the verb', revoke.status === 200, `got ${revoke.status}`);
  const meNarrower = await M('GET', '/auth/me');
  check(
    'revocation is immediate on an already-issued token',
    !(meNarrower.body?.data?.actions ?? []).includes('data.export'),
  );

  // ── The lockout invariants ─────────────────────────────────────────
  console.log('\nThe organisation cannot lock itself out');

  const selfDemote = await H('PATCH', `/roles/${await headRoleId()}`, { actions: ['data.export'] });
  check(
    'emptying role.manage from the last role that has it is refused 409',
    selfDemote.status === 409 && selfDemote.body?.error?.code === 'LAST_ROLE_MANAGER',
    `${selfDemote.status} ${JSON.stringify(selfDemote.body?.error)}`,
  );

  /**
   * Whether this is refusable depends on the database, so ask it the same
   * question the service asks rather than assuming a clean slate. In a fresh
   * environment our Head is the only `role.manage` holder and the guard fires;
   * where other Heads exist, self-demotion is legitimate and must succeed.
   *
   * The version that hardcoded 409 passed on my machine and would have failed
   * on any database with a second Head, a test that reports the environment,
   * not the code.
   */
  const [{ n: otherManagers }] = await sql`
    SELECT count(DISTINCT ur.user_id)::int AS n
    FROM user_roles ur
    JOIN role_actions ra ON ra.role_id = ur.role_id
    WHERE ra.action = 'role.manage' AND ur.user_id <> ${head.id}`;

  const stripLastHead = await H('PUT', `/users/${head.id}/roles`, {
    roles: ['SECRETARY'],
    primaryRole: 'SECRETARY',
  });

  if (otherManagers === 0) {
    check(
      'removing the LAST role.manage holder is refused 409',
      stripLastHead.status === 409 && stripLastHead.body?.error?.code === 'LAST_ROLE_MANAGER',
      `${stripLastHead.status} ${JSON.stringify(stripLastHead.body?.error)}`,
    );
  } else {
    check(
      `self-demotion succeeds while ${otherManagers} other role.manage holder(s) remain`,
      stripLastHead.status === 200,
      `${stripLastHead.status} ${JSON.stringify(stripLastHead.body?.error)}`,
    );
    /**
     * And it did not 500 on its own authority. Delete-then-insert used to fail
     * here: the DELETE removed the caller's `role.manage` mid-transaction and
     * the next statement was refused by the policy it had just satisfied.
     */
    const restored = await sql`
      SELECT count(*)::int AS n FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${head.id} AND r.code = 'SECRETARY'`;
    check('the new role was actually written', restored[0].n === 1);

    // Put the Head back so the rest of the suite still has an administrator.
    const [{ id: headRole }] = await sql`SELECT id FROM roles WHERE code = 'HEAD'`;
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${head.id}, ${headRole})
              ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM user_roles WHERE user_id = ${head.id}
              AND role_id <> ${headRole}`;
    await sql`UPDATE users SET primary_role_id = ${headRole} WHERE id = ${head.id}`;
  }

  const noRoles = await H('PUT', `/users/${mentor.id}/roles`, { roles: [], primaryRole: 'MENTOR' });
  check(
    'an account cannot be left with zero roles',
    noRoles.status === 422,
    `got ${noRoles.status}`,
  );

  const badPrimary = await H('PUT', `/users/${mentor.id}/roles`, {
    roles: ['MENTOR'],
    primaryRole: 'HEAD',
  });
  check(
    'a primary role the account does not hold is refused',
    badPrimary.status === 422,
    `got ${badPrimary.status}`,
  );

  const unknownRole = await H('PUT', `/users/${mentor.id}/roles`, {
    roles: ['NO_SUCH_ROLE'],
    primaryRole: 'NO_SUCH_ROLE',
  });
  check(
    'an unknown role code is refused 422',
    unknownRole.status === 422,
    `got ${unknownRole.status}`,
  );

  // ── Deleting ───────────────────────────────────────────────────────
  console.log('\nDeleting roles');
  const heldDelete = await H('DELETE', `/roles/${customRoleId}`);
  check(
    'a role somebody holds cannot be deleted (409)',
    heldDelete.status === 409 && heldDelete.body?.error?.code === 'ROLE_IN_USE',
    `${heldDelete.status} ${JSON.stringify(heldDelete.body?.error)}`,
  );

  const systemDelete = await H('DELETE', `/roles/${await headRoleId()}`);
  check(
    'a system role cannot be deleted (409)',
    systemDelete.status === 409,
    `got ${systemDelete.status}`,
  );

  await H('PUT', `/users/${mentor.id}/roles`, { roles: ['MENTOR'], primaryRole: 'MENTOR' });
  const freeDelete = await H('DELETE', `/roles/${customRoleId}`);
  check('once nobody holds it, it deletes', freeDelete.status === 200, `got ${freeDelete.status}`);
  const gone = await sql`SELECT id FROM roles WHERE code = ${CUSTOM_CODE}`;
  check('and the grants go with it', gone.length === 0);
  customRoleId = null;

  // ── The team directory ─────────────────────────────────────────────
  console.log('\nThe team directory shows colleagues, never customers');

  const secTeam = await S('GET', '/users');
  check('a Secretary can list the team', secTeam.status === 200, `got ${secTeam.status}`);
  const secIds = (secTeam.body?.data?.items ?? []).map((u) => u.id);
  check('and sees colleagues', secIds.includes(mentor.id) && secIds.includes(head.id));
  check(
    'but NOT guardians, parents are users too',
    !secIds.includes(guardian.id),
    JSON.stringify(secIds),
  );

  const parentTeam = await P('GET', '/users');
  check(
    'a guardian cannot open the team page at all',
    parentTeam.status === 403,
    `got ${parentTeam.status}`,
  );

  const secAssign = await S('PUT', `/users/${mentor.id}/roles`, {
    roles: ['MENTOR'],
    primaryRole: 'MENTOR',
  });
  check(
    'a Secretary can read the team but not grant roles',
    secAssign.status === 403,
    `got ${secAssign.status}`,
  );

  const headAll = await H('GET', '/users?scope=all');
  const allIds = (headAll.body?.data?.items ?? []).map((u) => u.id);
  check('user.manage sees customers too', allIds.includes(guardian.id));

  // ── Inviting a colleague ───────────────────────────────────────────
  console.log('\nInviting a colleague');

  const inviteEmail = `${TAG}-invited-${Date.now()}@example.test`;
  const invite = await H(
    'POST',
    '/users',
    {
      fullName: 'Kandidat Uji',
      email: inviteEmail,
      roles: ['SECRETARY'],
      primaryRole: 'SECRETARY',
    },
    key(),
  );
  check(
    'the Head invites (201)',
    invite.status === 201,
    `${invite.status} ${JSON.stringify(invite.body?.error)}`,
  );
  const invitedId = invite.body?.data?.id;
  if (invitedId) accounts.push(invitedId);
  check(
    'the account holds the role it was given',
    (invite.body?.data?.roles ?? []).includes('SECRETARY'),
  );

  /**
   * The account exists but has NO password, the invite email is the only way
   * in. If that message is never queued, somebody has been given an account
   * they can never reach and nothing anywhere says so.
   */
  const queued = await sql`
    SELECT status FROM outbox_message
    WHERE topic = 'notification.staff-invited' AND payload->>'userId' = ${invitedId ?? ''}`;
  check('an invite email is queued', queued.length === 1, `${queued.length} messages`);

  const dupe2 = await H(
    'POST',
    '/users',
    {
      fullName: 'Kandidat Uji',
      email: inviteEmail,
      roles: ['SECRETARY'],
      primaryRole: 'SECRETARY',
    },
    key(),
  );
  check(
    'the same email cannot be invited twice (409)',
    dupe2.status === 409,
    `got ${dupe2.status}`,
  );

  const asParent = await H(
    'POST',
    '/users',
    {
      fullName: 'Bukan Tim',
      email: `${TAG}-nope-${Date.now()}@example.test`,
      roles: ['PARENT'],
      primaryRole: 'PARENT',
    },
    key(),
  );
  check(
    'a CUSTOMER role cannot be assigned from /team (422)',
    asParent.status === 422 && asParent.body?.error?.code === 'CUSTOMER_ROLE_NOT_ASSIGNABLE',
    `${asParent.status} ${JSON.stringify(asParent.body?.error)}`,
  );

  const secInvite = await S(
    'POST',
    '/users',
    {
      fullName: 'Ditolak',
      email: `${TAG}-denied-${Date.now()}@example.test`,
      roles: ['MENTOR'],
      primaryRole: 'MENTOR',
    },
    key(),
  );
  check('a Secretary cannot invite (403)', secInvite.status === 403, `got ${secInvite.status}`);

  // ── Deactivation ───────────────────────────────────────────────────
  console.log('\nDeactivation, not deletion');
  const selfOff = await H('PATCH', `/users/${head.id}/status`, { status: 'INACTIVE' });
  check('you cannot deactivate yourself', selfOff.status === 409, `got ${selfOff.status}`);

  const off = await H('PATCH', `/users/${mentor.id}/status`, { status: 'INACTIVE' });
  check('the Head deactivates an account', off.status === 200, `got ${off.status}`);
  const blocked = await M('GET', '/auth/me');
  check(
    'a deactivated account is locked out immediately',
    blocked.status === 403 && blocked.body?.error?.code === 'ACCOUNT_INACTIVE',
    `${blocked.status} ${JSON.stringify(blocked.body?.error)}`,
  );
  const stillThere = await sql`SELECT status FROM users WHERE id = ${mentor.id}`;
  check('the row survives, so the audit trail does', stillThere[0]?.status === 'INACTIVE');

  await H('PATCH', `/users/${mentor.id}/status`, { status: 'ACTIVE' });
} finally {
  console.log('\nCleaning up…');
  const students = await sql`SELECT id FROM students WHERE slug LIKE ${`${TAG}%`}`;
  const sids = students.map((s) => s.id);
  if (sids.length) {
    await sql`DELETE FROM outbox_message WHERE payload->>'invoiceId' IN (SELECT id::text FROM invoices WHERE student_id = ANY(${sids}))`;
    await sql`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id = ANY(${sids}))`;
    await sql`DELETE FROM invoices WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM enrollments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  // LIKE, not =: the is_staff assertions add a second `-secret` programme.
  await sql`DELETE FROM programs WHERE slug LIKE ${`${TAG}%`}`;
  const custom = await sql`SELECT id FROM roles WHERE code LIKE ${`${CUSTOM_CODE}%`}`;
  for (const r of custom) {
    await sql`DELETE FROM role_pages WHERE role_id = ${r.id}`;
    await sql`DELETE FROM role_actions WHERE role_id = ${r.id}`;
    await sql`UPDATE users SET primary_role_id = NULL WHERE primary_role_id = ${r.id}`;
    await sql`DELETE FROM user_roles WHERE role_id = ${r.id}`;
    await sql`DELETE FROM roles WHERE id = ${r.id}`;
  }
  await sql`DELETE FROM outbox_message WHERE topic = 'notification.staff-invited' AND payload->>'userId' = ANY(${accounts})`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM idempotency_key WHERE actor_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await retry(async () => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }).catch(() => {});
  }
  await sql.end({ timeout: 5 });
}

async function headRoleId() {
  const [r] = await sql`SELECT id FROM roles WHERE code = 'HEAD'`;
  return r.id;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
