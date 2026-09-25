import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Competitions (doc 13 §12.8, doc 14 §3.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev                 # in one terminal
 *   npm run test:competitions   # in another
 *
 * doc 13 §P7 states the defect: "Internal CRUD writes to one place; the portal
 * reads a hardcoded catalog of 3 lomba. Adding a lomba in the admin changes
 * nothing for students." The assertion that proves it fixed is the boring one,
 * the same row comes back from the internal list, the portal's Info Lomba and
 * the anonymous marketing calendar.
 *
 * The rest is the authorisation split, which is where a competitions module
 * gets dangerous: participants and results name children, and the public
 * calendar is the one endpoint on this table an anonymous crawler may read.
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

const TAG = 'comp-test';
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
const competitionIds = [];

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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Lomba ${tag}`})`;
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

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

try {
  const head = await account('head', 'HEAD');
  const secretary = await account('sec', 'SECRETARY');
  const mentor = await account('mentor', 'MENTOR');
  const guardian = await account('parent', 'PARENT');
  const other = await account('other', 'PARENT');

  const H = api(head.token);
  const S = api(secretary.token);
  const M = api(mentor.token);
  const P = api(guardian.token);
  const X = api(other.token);
  const ANON = api(null);

  const aditya = await student(guardian.id, `Aditya${RUN}`, 'SMP');
  const bagus = await student(guardian.id, `Bagus${RUN}`, 'SMP');
  const nabila = await student(other.id, `Nabila${RUN}`, 'SMA');

  // ═══ the catalogue ═══════════════════════════════════════════════════
  console.log('\nCatalogue');

  const created = await H('POST', '/competitions', {
    name: `OSN Matematika ${RUN}`,
    registrationDeadline: inDays(30),
    level: 'NATIONAL',
    format: 'TEAM',
    mode: 'OFFLINE',
    levels: ['SMP', 'SMA'],
  });
  check('a competition can be created', created.status === 201, JSON.stringify(created.body));
  const compId = created.body?.data?.id;
  const compSlug = created.body?.data?.slug;
  competitionIds.push(compId);
  check(
    'the slug is derived from the name',
    typeof compSlug === 'string' && compSlug.startsWith('osn-matematika'),
    String(compSlug),
  );
  check('and it starts as a DRAFT', created.body?.data?.status === 'DRAFT');

  const secCreate = await S('POST', '/competitions', {
    name: `Coba sekretaris ${RUN}`,
    registrationDeadline: inDays(10),
  });
  check(
    'a Secretary cannot author the catalogue. It is /site content',
    secCreate.status === 403,
    String(secCreate.status),
  );

  const parentCreate = await P('POST', '/competitions', {
    name: `Coba ortu ${RUN}`,
    registrationDeadline: inDays(10),
  });
  check('nor can a guardian', parentCreate.status === 403, String(parentCreate.status));

  // ═══ the pipeline ════════════════════════════════════════════════════
  console.log('\nCMS pipeline');

  const patched = await H('PATCH', `/site/content/competition/${compId}`, {
    summary: 'Olimpiade sains nasional bidang matematika.',
    description: 'Seleksi bertingkat dari kabupaten sampai nasional.',
    organizer: 'Pusat Prestasi Nasional',
    venue: 'Jakarta',
    registrationFee: 250000,
    feeNote: 'Rp250.000 per tim, dibayar ke panitia.',
    guidebookUrl: 'https://example.test/panduan.pdf',
    categories: ['Matematika', 'Olimpiade'],
  });
  check(
    'the CMS pipeline edits it like any other content type',
    patched.status === 200,
    JSON.stringify(patched.body),
  );

  const statusReach = await H('PATCH', `/site/content/competition/${compId}`, {
    status: 'PUBLISHED',
  });
  check(
    'but the draft body cannot reach `status`',
    statusReach.status === 422,
    'editableColumns is an allowlist, and the schema is .strict()',
  );

  const badDates = await H('PATCH', `/site/content/competition/${compId}`, {
    eventStart: '2026-10-12',
    eventEnd: '2026-10-09',
  });
  check('an event that ends before it starts is refused', badDates.status === 422);

  const submitted = await H('POST', `/site/content/competition/${compId}/submit`, {});
  check('it can be submitted for review', submitted.status === 200, JSON.stringify(submitted.body));
  const approved = await H('POST', `/site/content/competition/${compId}/approve`, {});
  check('approved', approved.status === 200);
  const published = await H('POST', `/site/content/competition/${compId}/publish`, {});
  check('and published', published.status === 200, JSON.stringify(published.body));

  const [{ n: versions }] = await sql`
    SELECT count(*)::int AS n FROM content_versions
    WHERE entity_type = 'competition' AND entity_id = ${compId}`;
  check('publishing wrote a version snapshot', versions >= 1, String(versions));

  // ═══ one source ══════════════════════════════════════════════════════
  console.log('\nOne source (doc 13 §P7)');

  const internalList = await S('GET', '/competitions');
  check(
    'a Secretary sees it in the internal database',
    internalList.body?.data?.items?.some((c) => c.id === compId),
    JSON.stringify(internalList.body?.error ?? internalList.status),
  );

  const portalList = await P('GET', '/competitions');
  check(
    "and a guardian sees the SAME row in the portal's Info Lomba",
    portalList.body?.data?.items?.some((c) => c.id === compId),
    'the fixture made these two different lists',
  );

  const publicList = await ANON('GET', '/public/competitions');
  const publicRow = publicList.body?.data?.items?.find((c) => c.slug === compSlug);
  check(
    'and an anonymous visitor sees it on the marketing calendar',
    publicList.status === 200 && Boolean(publicRow),
    JSON.stringify(publicList.body?.error ?? publicList.status),
  );
  check(
    'with the marketing copy that was edited once',
    publicRow?.organizer === 'Pusat Prestasi Nasional' && publicRow?.registrationFee === 250000,
    JSON.stringify(publicRow),
  );

  const publicDetail = await ANON('GET', `/public/competitions/${compSlug}`);
  check('the public detail page resolves by slug', publicDetail.status === 200);

  // A second, unpublished competition. Nobody outside the building sees it.
  const draft = await H('POST', '/competitions', {
    name: `Lomba Rahasia ${RUN}`,
    registrationDeadline: inDays(45),
    levels: ['SMP'],
  });
  competitionIds.push(draft.body?.data?.id);
  const draftSlug = draft.body?.data?.slug;

  check(
    'a DRAFT competition is invisible to a guardian',
    !(await P('GET', '/competitions')).body.data.items.some((c) => c.id === draft.body.data.id),
  );
  check(
    'and to an anonymous visitor',
    !(await ANON('GET', '/public/competitions')).body.data.items.some((c) => c.slug === draftSlug),
  );
  check(
    'whose detail request 404s rather than saying "not yet"',
    (await ANON('GET', `/public/competitions/${draftSlug}`)).status === 404,
  );
  check(
    'but a Secretary running it can see it before Marketing publishes it',
    (await S('GET', '/competitions')).body.data.items.some((c) => c.id === draft.body.data.id),
    'roster work starts before the public page exists',
  );

  // ═══ participants ════════════════════════════════════════════════════
  console.log('\nParticipants');

  const entered = await S('POST', `/competitions/${compId}/targets`, { studentId: aditya });
  check('a Secretary enters a student', entered.status === 201, JSON.stringify(entered.body));
  const targetId = entered.body?.data?.id;

  const twice = await S('POST', `/competitions/${compId}/targets`, { studentId: aditya });
  check(
    'the same student twice is one entry',
    twice.status === 409 && twice.body?.error?.code === 'ALREADY_ENTERED',
    JSON.stringify(twice.body),
  );

  const mentorEnters = await M('POST', `/competitions/${compId}/targets`, { studentId: bagus });
  check(
    'a Mentor cannot enter a student. That is student.edit',
    mentorEnters.status === 403,
    String(mentorEnters.status),
  );
  await S('POST', `/competitions/${compId}/targets`, { studentId: bagus });
  await S('POST', `/competitions/${compId}/targets`, { studentId: nabila });

  const parentEnters = await P('POST', `/competitions/${compId}/targets`, { studentId: aditya });
  check('nor can a guardian enter their own child', parentEnters.status === 403);

  // ═══ readiness and result ════════════════════════════════════════════
  console.log('\nReadiness and result');

  const readiness = await M('PATCH', `/competitions/${compId}/targets/${targetId}`, {
    readinessPct: 72,
  });
  check(
    'a Mentor records readiness, progress.edit',
    readiness.status === 200,
    JSON.stringify(readiness.body),
  );

  const secResult = await S('PATCH', `/competitions/${compId}/targets/${targetId}`, {
    readinessPct: 100,
  });
  check(
    'a Secretary cannot, entering a student is not deciding how they did',
    secResult.status === 403,
    String(secResult.status),
  );

  const outOfRange = await M('PATCH', `/competitions/${compId}/targets/${targetId}`, {
    readinessPct: 140,
  });
  check('readiness outside 0–100 is refused', outOfRange.status === 422);

  const awardWithoutResult = await M('PATCH', `/competitions/${compId}/targets/${targetId}`, {
    award: 'Juara 2',
    result: 'PENDING',
  });
  check(
    'an award on a PENDING result is refused',
    awardWithoutResult.status === 422,
    'the achievement wall and the auto-draft both read `result`, not `award`',
  );

  const win = await M('PATCH', `/competitions/${compId}/targets/${targetId}`, {
    result: 'WINNER',
    award: 'Juara 2',
    score: 87,
  });
  check('a win is recorded', win.status === 200 && win.body?.data?.result === 'WINNER');

  const [recorded] = await sql`
    SELECT recorded_by_id AS "recordedById", recorded_at AS "recordedAt"
    FROM competition_targets WHERE id = ${targetId}`;
  check(
    'and stamped with who decided it',
    recorded.recordedById === mentor.id && recorded.recordedAt !== null,
  );

  await M('PATCH', `/competitions/${compId}/targets/${targetId}`, { readinessPct: 95 });
  const [afterNudge] = await sql`
    SELECT recorded_by_id AS "recordedById" FROM competition_targets WHERE id = ${targetId}`;
  check(
    'a later readiness nudge does not overwrite the recorder',
    afterNudge.recordedById === mentor.id,
    'who decided the outcome is not who last moved a slider',
  );

  // ═══ what a family may see ═══════════════════════════════════════════
  console.log('\nWhat a family may see');

  const mine = await P('GET', `/competitions?studentId=${aditya}`);
  check(
    'a guardian sees their own child’s entry',
    mine.body?.data?.items?.[0]?.myResult === 'WINNER',
    JSON.stringify(mine.body?.data?.items?.[0]),
  );

  const notMine = await P('GET', `/competitions?studentId=${nabila}`);
  check(
    "and nothing at all for another family's child",
    notMine.body?.data?.items?.length === 0,
    'RLS returns no rows rather than raising, so this asserts emptiness',
  );

  const detail = await P('GET', `/competitions/${compId}`);
  check(
    'the detail page returns for a guardian',
    detail.status === 200,
    JSON.stringify(detail.body?.error),
  );
  check(
    'but its participant list holds only their own children',
    detail.body?.data?.participants?.length === 2 &&
      detail.body.data.participants.every((p) => p.studentId !== nabila),
    JSON.stringify(detail.body?.data?.participants?.map((p) => p.studentName)),
  );

  const staffDetail = await S('GET', `/competitions/${compId}`);
  check(
    'while a Secretary sees all three',
    staffDetail.body?.data?.participants?.length === 3,
    String(staffDetail.body?.data?.participants?.length),
  );
  check(
    'with the readiness distribution doc 13 §12.8 asks for',
    staffDetail.body?.data?.distribution?.b75 === 1 &&
      staffDetail.body?.data?.distribution?.b0 === 2,
    JSON.stringify(staffDetail.body?.data?.distribution),
  );
  check(
    'and the rollup counts the win',
    staffDetail.body?.data?.competition?.winnerCount === 1 &&
      staffDetail.body?.data?.competition?.targetCount === 3,
    JSON.stringify(staffDetail.body?.data?.competition),
  );

  // ═══ mentor read access ══════════════════════════════════════════════
  console.log('\nMentor access (doc 13 §8.3)');

  const mentorDetail = await M('GET', `/competitions/${compId}`);
  check(
    'a Mentor can open a competition record',
    mentorDetail.status === 200 && mentorDetail.body?.data?.participants?.length === 3,
    'doc 13 §8.3 gives them the page as READ; the seed never had',
  );

  // ═══ teams ═══════════════════════════════════════════════════════════
  console.log('\nTeams');

  const team = await S('POST', `/competitions/${compId}/teams`, {
    name: `Tim Alpha ${RUN}`,
    mentorId: mentor.id,
  });
  check('a team can be formed', team.status === 201, JSON.stringify(team.body));
  const teamId = team.body?.data?.id;

  const dupName = await S('POST', `/competitions/${compId}/teams`, { name: `Tim Alpha ${RUN}` });
  check('two teams cannot share a name in one lomba', dupName.status === 409);

  const leader = await S('POST', `/competitions/${compId}/teams/${teamId}/members`, {
    studentId: aditya,
    role: 'LEADER',
  });
  check('a leader is added', leader.status === 201, JSON.stringify(leader.body));

  const secondLeader = await S('POST', `/competitions/${compId}/teams/${teamId}/members`, {
    studentId: bagus,
    role: 'LEADER',
  });
  check(
    'a second leader is refused',
    secondLeader.status === 409 && secondLeader.body?.error?.code === 'LEADER_EXISTS',
    JSON.stringify(secondLeader.body),
  );

  const member = await S('POST', `/competitions/${compId}/teams/${teamId}/members`, {
    studentId: bagus,
  });
  check('a member is added', member.status === 201);

  const stranger = await student(other.id, `Citra${RUN}`, 'SMA');
  const notEntered = await S('POST', `/competitions/${compId}/teams/${teamId}/members`, {
    studentId: stranger,
  });
  check(
    'a student not entered in the lomba cannot join its team',
    notEntered.status === 422 && notEntered.body?.error?.code === 'NOT_A_PARTICIPANT',
    JSON.stringify(notEntered.body),
  );

  const teamB = await S('POST', `/competitions/${compId}/teams`, { name: `Tim Beta ${RUN}` });
  const twoTeams = await S('POST', `/competitions/${compId}/teams/${teamB.body.data.id}/members`, {
    studentId: aditya,
  });
  check(
    'and nobody competes on two teams in the same lomba',
    twoTeams.status === 409 && twoTeams.body?.error?.code === 'ALREADY_IN_TEAM',
    JSON.stringify(twoTeams.body),
  );

  const withTeams = await S('GET', `/competitions/${compId}`);
  const alpha = withTeams.body?.data?.teams?.find((t) => t.id === teamId);
  check(
    'the detail page returns teams with their members',
    alpha?.members?.length === 2 && alpha.mentorName !== null,
    JSON.stringify(alpha),
  );

  const parentTeams = await P('GET', `/competitions/${compId}`);
  const parentAlpha = parentTeams.body?.data?.teams?.find((t) => t.id === teamId);
  check(
    'a guardian sees the team their child is on',
    Boolean(parentAlpha),
    'which team my child is on is a question the portal has to answer',
  );

  const disband = await S('DELETE', `/competitions/${compId}/teams/${teamId}`);
  check('a team can be disbanded', disband.status === 200);
  const [survivors] = await sql`
    SELECT count(*)::int AS n FROM competition_targets WHERE competition_id = ${compId}`;
  check(
    'and the participants survive it',
    survivors.n === 3,
    'being in the wrong team is not the same as not competing',
  );

  // ═══ what anon may reach ═════════════════════════════════════════════
  console.log('\nWhat anon may reach');

  const [{ n: anonTables }] = await sql`
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_name IN ('competition_targets', 'teams', 'team_members')`;
  check(
    'anon holds no grant on participants, teams or members',
    anonTables === 0,
    'the public calendar is a lead magnet; a child’s placing is not',
  );

  check(
    'and the public payload carries no participant rollup at all',
    Boolean(publicRow) && !('targetCount' in publicRow) && !('winnerCount' in publicRow),
    JSON.stringify(Object.keys(publicRow ?? {})),
  );

  // ═══ the derived phase ═══════════════════════════════════════════════
  console.log('\nDerived phase');

  const closed = await H('POST', '/competitions', {
    name: `Lomba Lewat ${RUN}`,
    registrationDeadline: inDays(-5),
    levels: ['SMP'],
  });
  competitionIds.push(closed.body?.data?.id);
  await H('POST', `/site/content/competition/${closed.body.data.id}/submit`, {});
  await H('POST', `/site/content/competition/${closed.body.data.id}/approve`, {});
  await H('POST', `/site/content/competition/${closed.body.data.id}/publish`, {});

  const defaultPublic = await ANON('GET', '/public/competitions');
  check(
    'a passed deadline drops off the public calendar',
    !defaultPublic.body.data.items.some((c) => c.slug === closed.body.data.slug),
    'the fixture stored the phase and would have said "Ongoing" forever',
  );
  const withClosed = await ANON('GET', '/public/competitions?includeClosed=true');
  const closedRow = withClosed.body.data.items.find((c) => c.slug === closed.body.data.slug);
  check(
    'but is reachable, marked CLOSED',
    closedRow?.phase === 'CLOSED',
    JSON.stringify(closedRow?.phase),
  );

  const openRow = (await S('GET', '/competitions')).body.data.items.find((c) => c.id === compId);
  check('and a live one reads OPEN', openRow?.phase === 'OPEN', String(openRow?.phase));

  // ═══ the sitemap ═════════════════════════════════════════════════════
  console.log('\nSitemap');

  const sitemap = await ANON('GET', '/public/sitemap');
  check(
    'the seventh content type appears in the sitemap on the day it is registered',
    sitemap.body?.data?.items?.some((e) => e.path === `/competitions/${compSlug}`),
    JSON.stringify(sitemap.body?.data?.items?.filter((e) => e.type === 'competition')),
  );
  check(
    'and a draft competition does not',
    !sitemap.body?.data?.items?.some((e) => e.path === `/competitions/${draftSlug}`),
  );
} finally {
  const ids = competitionIds.filter(Boolean);
  if (ids.length) {
    await sql`DELETE FROM team_members WHERE competition_id = ANY(${ids})`;
    await sql`DELETE FROM teams WHERE competition_id = ANY(${ids})`;
    await sql`DELETE FROM competition_targets WHERE competition_id = ANY(${ids})`;
    await sql`DELETE FROM content_versions WHERE entity_type = 'competition' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM seo_meta WHERE entity_type = 'competition' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM redirects WHERE to_path LIKE '/competitions/%' OR from_path LIKE '/competitions/%'`;
    await sql`DELETE FROM audit_log WHERE entity IN ('competition', 'competition_target', 'team')`;
    await sql`DELETE FROM competitions WHERE id = ANY(${ids})`;
  }
  const sids = studentIds.filter(Boolean);
  if (sids.length) await sql`DELETE FROM students WHERE id = ANY(${sids})`;
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
