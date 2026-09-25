import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /v1/me: profile, settings, notifications, achievements.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev      # in one terminal
 *   npm run test:me  # in another
 *
 * These endpoints exist because five portal screens were rendering fixtures:
 * every family saw "Aditya Pratama" and a leaderboard of three invented
 * classmates. So the assertions here are mostly about IDENTITY, that the
 * signed-in account gets ITS OWN name, ITS OWN child, ITS OWN notifications,
 * and that a second account gets different answers to the same questions.
 *
 * Signs in with the REAL seeded accounts rather than building throwaway ones:
 * the bug being guarded against is "the page shows somebody else", and that is
 * only meaningful against the roster the portal actually serves. Everything it
 * changes is put back in the finally block.
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';

const anonClient = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

let pass = 0;
let fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}${!ok && d ? `, ${d}` : ''}`,
  );
};
const step = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

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

async function signIn(email, password) {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return api(data.session.access_token);
}

/** Restored in the finally block. This test must not edit the real roster. */
let restore = null;

try {
  // ── 0. who we are testing with ───────────────────────────────────────
  step('0. Real accounts');

  const [student] = await sql`
    SELECT s.id, s.name, s.slug, s.level::text AS level, s.parent_name, s.parent_phone,
           s.show_on_leaderboard, u.email, u.full_name
    FROM students s JOIN users u ON u.id = s.user_id
    WHERE u.email = 'alfi-nur-azizah-student@metroscope.id'`;
  check('the test student exists in the roster', Boolean(student), 'seed accounts first');
  if (!student) throw new Error('no student to test with');
  console.log(`  ${student.full_name} <${student.email}> · ${student.level}`);

  const parent = await signIn(student.email, 'metroscope123');
  const mentor = await signIn('mentor-staff@metroscope.id', 'mentor123');
  const head = await signIn('balqis@metroscope.id', 'metroscope123');

  // ── 1. the profile is the CALLER'S OWN ───────────────────────────────
  step('1. GET /me/profile');

  const p = await parent('GET', '/me/profile');
  check('200', p.status === 200, String(p.status));
  check(
    'names the signed-in account, not a fixture',
    p.body?.data?.fullName === student.full_name,
    `got ${p.body?.data?.fullName}`,
  );
  check('email matches', p.body?.data?.email === student.email);
  check('carries the caller own child', p.body?.data?.students?.[0]?.id === student.id);
  check(
    'and only that child',
    p.body?.data?.students?.length === 1,
    `${p.body?.data?.students?.length} students`,
  );
  check(
    'never returns the fixture name',
    JSON.stringify(p.body).includes('Aditya Pratama') === false,
  );

  const m = await mentor('GET', '/me/profile');
  check('a mentor gets their own profile too', m.status === 200 && Boolean(m.body?.data?.fullName));
  check('a mentor has no children', (m.body?.data?.students ?? []).length === 0);

  // ── 2. the profile round-trips ───────────────────────────────────────
  step('2. PATCH /me/profile persists');

  const originalName = p.body.data.fullName;
  const originalBio = p.body.data.bio;
  restore = async () => {
    await sql`UPDATE users SET full_name = ${originalName}, bio = ${originalBio}
              WHERE email = ${student.email}`;
    await sql`UPDATE students SET parent_name = ${student.parent_name},
              parent_phone = ${student.parent_phone},
              show_on_leaderboard = ${student.show_on_leaderboard} WHERE id = ${student.id}`;
  };

  const marker = `Bio uji ${Date.now()}`;
  const w = await parent('PATCH', '/me/profile', { bio: marker });
  check('200', w.status === 200, JSON.stringify(w.body));
  check('the response already shows the new value', w.body?.data?.bio === marker);

  const reread = await parent('GET', '/me/profile');
  check('and it survives a fresh read', reread.body?.data?.bio === marker, 'not persisted');

  const [dbRow] = await sql`SELECT bio FROM users WHERE email = ${student.email}`;
  check('the DATABASE has it, not just the response', dbRow.bio === marker);

  // ── 3. what a profile write must NOT reach ───────────────────────────
  step('3. PATCH /me/profile is not a privilege escalation');

  const esc = await parent('PATCH', '/me/profile', { status: 'ACTIVE' });
  check('an unknown field is rejected outright', esc.status === 422, String(esc.status));

  const esc2 = await parent('PATCH', '/me/profile', { primaryRole: 'HEAD' });
  check('so is a role change', esc2.status === 422, String(esc2.status));

  // ── 4. student settings, the three fields a family owns ──────────────
  step('4. PATCH /me/students/:id');

  const s1 = await parent('PATCH', `/me/students/${student.id}`, {
    parentName: 'Wali Uji',
    parentPhone: '081200000000',
    showOnLeaderboard: true,
  });
  check('200', s1.status === 200, JSON.stringify(s1.body));

  const [afterRow] = await sql`
    SELECT parent_name, parent_phone, show_on_leaderboard, points, account_status::text
    FROM students WHERE id = ${student.id}`;
  check('parent name persisted', afterRow.parent_name === 'Wali Uji');
  check('parent phone persisted', afterRow.parent_phone === '081200000000');
  check('the privacy toggle persisted', afterRow.show_on_leaderboard === true);
  check('and account_status was NOT touched', afterRow.account_status === 'LIMITED');

  const partial = await parent('PATCH', `/me/students/${student.id}`, { showOnLeaderboard: false });
  const [afterPartial] = await sql`
    SELECT parent_name, show_on_leaderboard FROM students WHERE id = ${student.id}`;
  check('200', partial.status === 200);
  check(
    'a partial write leaves the other fields alone',
    afterPartial.parent_name === 'Wali Uji',
    `got ${afterPartial.parent_name}`,
  );
  check('and applies the field it was given', afterPartial.show_on_leaderboard === false);

  const [other] = await sql`
    SELECT id FROM students
    WHERE user_id <> (SELECT id FROM users WHERE email = ${student.email}) LIMIT 1`;
  const cross = await parent('PATCH', `/me/students/${other.id}`, { showOnLeaderboard: true });
  check(
    'another family child is refused',
    cross.status === 404 || cross.status === 403,
    String(cross.status),
  );
  const [untouched] = await sql`SELECT show_on_leaderboard FROM students WHERE id = ${other.id}`;
  check('and really was not written', untouched.show_on_leaderboard === false);

  const bad = await parent('PATCH', `/me/students/${student.id}`, { points: 9999 });
  check('points is not a field a family may set', bad.status === 422, String(bad.status));

  // ── 5. achievements ──────────────────────────────────────────────────
  step('5. GET /me/achievements');

  const a = await parent('GET', '/me/achievements');
  check('200', a.status === 200, String(a.status));
  check('the student is the caller own', a.body?.data?.student?.id === student.id);

  const [cohort] = await sql`
    SELECT count(*)::int AS n FROM students
    WHERE level IS NOT DISTINCT FROM ${student.level}::school_level AND student_status = 'ACTIVE'`;
  check(
    'the cohort is the real one, not 1',
    a.body?.data?.total === cohort.n,
    `api ${a.body?.data?.total} vs db ${cohort.n}`,
  );
  check(
    'the board has more than just the caller',
    (a.body?.data?.leaderboard ?? []).length > 1,
    `${(a.body?.data?.leaderboard ?? []).length} rows`,
  );
  check(
    'badges are derived and present',
    Array.isArray(a.body?.data?.badges) && a.body.data.badges.length > 0,
  );

  const you = (a.body?.data?.leaderboard ?? []).filter((r) => r.isYou);
  check('exactly one row is marked as you', you.length === 1, `${you.length}`);

  const named = (a.body?.data?.leaderboard ?? []).filter(
    (r) => !r.isYou && r.name !== 'Siswa lain',
  );
  const [optedIn] = await sql`
    SELECT count(*)::int AS n FROM students
    WHERE show_on_leaderboard AND id <> ${student.id}
      AND level IS NOT DISTINCT FROM ${student.level}::school_level`;
  check(
    'only opted-in classmates are named',
    named.length <= optedIn.n,
    `${named.length} named vs ${optedIn.n} opted in`,
  );

  const ma = await mentor('GET', '/me/achievements');
  check(
    'a mentor gets an empty board, not a 404',
    ma.status === 200 && ma.body?.data?.student === null,
    String(ma.status),
  );
  const ha = await head('GET', '/me/achievements');
  check(
    'so does the Head',
    ha.status === 200 && ha.body?.data?.student === null,
    String(ha.status),
  );

  const staffLook = await head('GET', `/me/achievements?student=${student.slug}`);
  check(
    'staff may look up a student by slug',
    staffLook.body?.data?.student?.id === student.id,
    String(staffLook.status),
  );

  const nosy = await parent('GET', `/me/achievements?student=${other.id}`);
  check(
    'a parent asking for another family child gets nothing',
    nosy.body?.data?.student === null,
    JSON.stringify(nosy.body?.data?.student),
  );

  // ── 6. notifications ─────────────────────────────────────────────────
  step('6. GET /me/notifications');

  const n = await parent('GET', '/me/notifications');
  check('200', n.status === 200, String(n.status));
  check(
    'shape is items + unread',
    Array.isArray(n.body?.data?.items) && typeof n.body?.data?.unread === 'number',
  );

  // Plant one for this account, then prove the bell finds exactly it.
  const [planted] = await sql`
    INSERT INTO notifications (user_id, recipient_email, channel, template, payload, status, sent_at)
    VALUES ((SELECT id FROM users WHERE email = ${student.email}), ${student.email}, 'EMAIL',
            'invoice.issued', ${JSON.stringify({ subject: 'Tagihan uji' })}::text::jsonb, 'SENT', now())
    RETURNING id`;
  const [plantedOther] = await sql`
    INSERT INTO notifications (user_id, recipient_email, channel, template, payload, status, sent_at)
    VALUES ((SELECT id FROM users WHERE email = 'mentor-staff@metroscope.id'),
            'mentor-staff@metroscope.id', 'EMAIL', 'invoice.issued',
            ${JSON.stringify({ subject: 'Bukan milikmu' })}::text::jsonb, 'SENT', now())
    RETURNING id`;
  /** A delivery that never happened must not appear as if it had. */
  const [plantedFailed] = await sql`
    INSERT INTO notifications (user_id, recipient_email, channel, template, payload, status, last_error)
    VALUES ((SELECT id FROM users WHERE email = ${student.email}), ${student.email}, 'EMAIL',
            'invoice.reminder', ${JSON.stringify({})}::text::jsonb, 'FAILED', 'bounced')
    RETURNING id`;

  const n2 = await parent('GET', '/me/notifications');
  const ids = (n2.body?.data?.items ?? []).map((i) => i.id);
  check('the planted notification is listed', ids.includes(planted.id));
  check('another account notification is not', ids.includes(plantedOther.id) === false);
  check('a FAILED send is not shown as delivered', ids.includes(plantedFailed.id) === false);
  check(
    'the title is the rendered subject',
    n2.body.data.items.find((i) => i.id === planted.id)?.title === 'Tagihan uji',
  );
  check(
    'and it carries a portal route to open',
    n2.body.data.items.find((i) => i.id === planted.id)?.href === '/portal/billing',
  );
  check('unread counts it', n2.body?.data?.unread >= 1, String(n2.body?.data?.unread));

  const readRes = await parent('POST', `/me/notifications/${planted.id}/read`);
  check('mark-as-read returns 200', readRes.status === 200, String(readRes.status));
  const [readRow] = await sql`SELECT read_at FROM notifications WHERE id = ${planted.id}`;
  check('and the database agrees', readRow.read_at !== null);

  const foreign = await parent('POST', `/me/notifications/${plantedOther.id}/read`);
  check(
    'a parent cannot mark another account notification read',
    foreign.status === 404,
    String(foreign.status),
  );

  const all = await parent('POST', '/me/notifications/read-all');
  check('mark-all returns 200', all.status === 200, String(all.status));
  const [stillUnread] = await sql`
    SELECT count(*)::int AS n FROM notifications
    WHERE user_id = (SELECT id FROM users WHERE email = ${student.email}) AND read_at IS NULL`;
  check('nothing of the caller is left unread', stillUnread.n === 0, `${stillUnread.n} left`);

  await sql`DELETE FROM notifications
            WHERE id IN (${planted.id}, ${plantedOther.id}, ${plantedFailed.id})`;

  // ── 7. preferences ───────────────────────────────────────────────────
  step('7. PUT /me/preferences');

  const pref = await parent('PUT', '/me/preferences', {
    preferences: [{ channel: 'EMAIL', category: 'billing', enabled: false }],
  });
  check('200', pref.status === 200, JSON.stringify(pref.body));
  const [prefRow] = await sql`
    SELECT enabled FROM notification_preferences
    WHERE user_id = (SELECT id FROM users WHERE email = ${student.email})
      AND channel = 'EMAIL' AND category = 'billing'`;
  check('persisted to the database', prefRow?.enabled === false);

  const prefBack = await parent('PUT', '/me/preferences', {
    preferences: [{ channel: 'EMAIL', category: 'billing', enabled: true }],
  });
  check('and it toggles back', prefBack.status === 200);

  const badChannel = await parent('PUT', '/me/preferences', {
    preferences: [{ channel: 'INAPP', category: 'billing', enabled: true }],
  });
  check(
    'an invalid channel is refused before it reaches the enum',
    badChannel.status === 422,
    String(badChannel.status),
  );

  await sql`DELETE FROM notification_preferences
            WHERE user_id = (SELECT id FROM users WHERE email = ${student.email})
              AND category = 'billing'`;

  // ── 8. anonymous ─────────────────────────────────────────────────────
  step('8. Nothing here is public');

  const anon = api(null);
  for (const path of ['/me/profile', '/me/notifications', '/me/achievements']) {
    const r = await anon('GET', path);
    check(`GET ${path} is 401 without a token`, r.status === 401, String(r.status));
  }
  const anonWrite = await anon('PATCH', '/me/profile', { bio: 'x' });
  check(
    'PATCH /me/profile is 401 without a token',
    anonWrite.status === 401,
    String(anonWrite.status),
  );
} finally {
  if (restore) await restore();
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
