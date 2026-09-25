import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Achievement articles (doc 03 FR-UPD-4 / FR-ART-8, doc 13 §10.5, doc 14 §3.7).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev                 # in one terminal
 *   npm run test:achievements   # in another
 *
 * FR-UPD-4: "Recording a **win** emits `competition.result`, which auto-creates
 * an `Article` DRAFT in category *Prestasi Siswa* … The mentor never writes an
 * article."
 *
 * The assertions that matter are the ones about what does NOT happen: a
 * FINALIST does not become an article, a readiness slider does not, a second
 * save does not, and **no consent means no publication**: a child's name on
 * the open web is the thing this whole seam is careful about.
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
const sql = postgres(required('DIRECT_URL'), { max: 4 });

const TAG = 'ach-test';
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Ach ${tag}`})`;
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
    INSERT INTO students (user_id, name, slug, join_date, account_status, level, student_status)
    VALUES (${guardianId}, ${name}, ${`${TAG}-${name.toLowerCase()}-${RUN}`}, current_date,
            'ACTIVE', 'SMP'::school_level, 'ACTIVE')
    RETURNING id, slug, name`;
  studentIds.push(row.id);
  return row;
}

async function competition(name) {
  const [row] = await sql`
    INSERT INTO competitions (slug, name, organizer, level, registration_deadline, status)
    VALUES (${`${TAG}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${RUN}`}, ${name},
            'Panitia Uji', 'NATIONAL', now() + interval '30 days', 'PUBLISHED')
    RETURNING id, name`;
  competitionIds.push(row.id);
  return row;
}

const enter = async (studentId, competitionId) => {
  const [row] = await sql`
    INSERT INTO competition_targets (student_id, competition_id) VALUES (${studentId}, ${competitionId})
    RETURNING id`;
  return row.id;
};

const draftsFor = (targetId) =>
  sql`SELECT id, title, slug, status::text AS status, excerpt, body, author_id AS "authorId",
             student_id AS "studentId", competition_id AS "competitionId",
             category_id AS "categoryId", consent_source AS "consentSource"
      FROM articles WHERE competition_target_id = ${targetId}`;

try {
  const mentor = await account('mentor', 'MENTOR');
  const head = await account('head', 'HEAD');
  const editor = await account('editor', 'EDITOR');
  const secretary = await account('sec', 'SECRETARY');
  const guardian = await account('parent', 'PARENT');

  const M = api(mentor.token);
  const H = api(head.token);
  const E = api(editor.token);
  const S = api(secretary.token);
  const P = api(guardian.token);
  const ANON = api(null);

  const aditya = await student(guardian.id, `Aditya${RUN}`);
  const bagus = await student(guardian.id, `Bagus${RUN}`);
  const citra = await student(guardian.id, `Citra${RUN}`);

  const osn = await competition(`OSN Uji ${RUN}`);
  const osp = await competition(`OSP Uji ${RUN}`);

  const [{ id: prestasiId }] = await sql`
    SELECT id FROM article_categories WHERE slug = 'prestasi-siswa'`;

  // ═══ the trigger ═════════════════════════════════════════════════════
  console.log('\nThe trigger (FR-UPD-4)');

  const adityaTarget = await enter(aditya.id, osn.id);
  check('entering a student creates no article', (await draftsFor(adityaTarget)).length === 0);

  await M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, { readinessPct: 80 });
  check(
    'a readiness slider creates no article',
    (await draftsFor(adityaTarget)).length === 0,
    'readiness is not a business event',
  );

  const finalistTarget = await enter(bagus.id, osn.id);
  await M('PATCH', `/competitions/${osn.id}/targets/${finalistTarget}`, { result: 'FINALIST' });
  check(
    'FINALIST creates no achievement article',
    (await draftsFor(finalistTarget)).length === 0,
    'only one of five results is a win; turning up is not an achievement to publish',
  );

  const win = await M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, {
    result: 'WINNER',
    award: 'Juara 2',
  });
  check('recording a WINNER succeeds', win.status === 200, JSON.stringify(win.body));

  const drafts = await draftsFor(adityaTarget);
  check('and drafts exactly one article', drafts.length === 1, String(drafts.length));

  const draft = drafts[0];
  check('it starts as a DRAFT', draft?.status === 'DRAFT', String(draft?.status));
  check(
    'in category Prestasi Siswa',
    draft?.categoryId === prestasiId,
    'FR-UPD-4 names the category',
  );
  check(
    'with NO author, the mentor did not write it',
    draft?.authorId === null,
    `${draft?.authorId}, crediting the recorder would be a lie in the byline`,
  );
  check(
    'linked to the student and the competition',
    draft?.studentId === aditya.id && draft?.competitionId === osn.id,
  );

  // ═══ the content ═════════════════════════════════════════════════════
  console.log('\nThe content, facts only');

  check(
    "the title carries the child's name and the recorded award",
    draft?.title?.includes(aditya.name) && draft?.title?.includes('Juara 2'),
    String(draft?.title),
  );
  check(
    'the slug follows the article slug policy',
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft?.slug ?? ''),
    String(draft?.slug),
  );
  check(
    'the excerpt is filled, so the pipeline can accept a submit',
    Boolean(draft?.excerpt?.trim()),
  );

  const bodyText = JSON.stringify(draft?.body ?? {});
  check(
    'the body names the competition and the organiser that were recorded',
    bodyText.includes(osn.name) && bodyText.includes('Panitia Uji'),
    bodyText.slice(0, 200),
  );
  check(
    'and invents no score when none was entered',
    !bodyText.includes('Skor:'),
    'nothing here may be fabricated',
  );

  const scoredTarget = await enter(citra.id, osp.id);
  await M('PATCH', `/competitions/${osp.id}/targets/${scoredTarget}`, {
    result: 'WINNER',
    award: 'Juara 1',
    score: 95,
  });
  const scoredDraft = (await draftsFor(scoredTarget))[0];
  check(
    'but does include a score that WAS entered',
    JSON.stringify(scoredDraft?.body ?? {}).includes('Skor: 95'),
  );

  const noAward = await enter(bagus.id, osp.id);
  await sql`UPDATE competition_targets SET result = 'WINNER' WHERE id = ${noAward}`;
  const plain = (await draftsFor(noAward))[0];
  check(
    'a win with no award recorded says only "Juara"',
    plain?.title?.includes('Juara') && !plain?.title?.includes('Juara 1'),
    String(plain?.title),
  );

  // ═══ idempotency ═════════════════════════════════════════════════════
  console.log('\nIdempotency');

  await M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, { result: 'WINNER' });
  check(
    'saving WINNER again drafts nothing new',
    (await draftsFor(adityaTarget)).length === 1,
    'the transition already happened',
  );

  await M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, { readinessPct: 95 });
  check('nor does a later readiness change', (await draftsFor(adityaTarget)).length === 1);

  await sql`UPDATE competition_targets SET note = 'sertifikat sudah diunggah' WHERE id = ${adityaTarget}`;
  check('nor an unrelated column', (await draftsFor(adityaTarget)).length === 1);

  await Promise.all([
    M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, { result: 'WINNER' }),
    M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, { result: 'WINNER' }),
    M('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, { result: 'WINNER' }),
  ]);
  check(
    'three simultaneous requests still leave one',
    (await draftsFor(adityaTarget)).length === 1,
  );

  /**
   * The concurrency case that matters: two transactions racing the SAME
   * transition. Both are told the row was PENDING, both set WINNER, and the
   * partial unique index is what stops the second draft, an application
   * `if (!existing) create` could not.
   */
  const raceTarget = await enter(aditya.id, osp.id);
  const race = async () =>
    sql.begin(async (tx) => {
      await tx`UPDATE competition_targets SET result = 'PENDING' WHERE id = ${raceTarget}`;
      await tx`UPDATE competition_targets SET result = 'WINNER' WHERE id = ${raceTarget}`;
    });
  await Promise.allSettled([race(), race(), race(), race()]);
  check(
    'four concurrent transitions produce one article, not four',
    (await draftsFor(raceTarget)).length === 1,
    'the uniqueness invariant is in the database, not in an if',
  );

  // ═══ correction away from WINNER ═════════════════════════════════════
  console.log('\nCorrection');

  await M('PATCH', `/competitions/${osp.id}/targets/${scoredTarget}`, { result: 'PARTICIPANT' });
  check(
    'correcting a result away from WINNER keeps the draft',
    (await draftsFor(scoredTarget)).length === 1,
    'no document defines deletion, and silently destroying editorial work is worse than leaving it',
  );
  await M('PATCH', `/competitions/${osp.id}/targets/${scoredTarget}`, {
    result: 'WINNER',
    award: 'Juara 1',
  });
  check(
    'and winning again does not draft a second one',
    (await draftsFor(scoredTarget)).length === 1,
  );

  // ═══ distinct wins ═══════════════════════════════════════════════════
  console.log('\nDistinct wins');

  const all = await sql`
    SELECT competition_target_id FROM articles
    WHERE student_id = ${aditya.id} AND competition_target_id IS NOT NULL`;
  check(
    'the same student winning two competitions gets two articles',
    all.length === 2,
    String(all.length),
  );

  const second = await enter(citra.id, osn.id);
  await M('PATCH', `/competitions/${osn.id}/targets/${second}`, {
    result: 'WINNER',
    award: 'Juara 3',
  });
  const both = await sql`
    SELECT id FROM articles WHERE competition_id = ${osn.id} AND competition_target_id IS NOT NULL`;
  check(
    'and two winners in one competition get one article each',
    both.length === 2,
    String(both.length),
  );

  // ═══ who can see the draft ═══════════════════════════════════════════
  console.log('\nWho can see the draft');

  const editorList = await E('GET', `/site/articles?categoryId=${prestasiId}`);
  check(
    'an Editor finds it in the article list',
    editorList.status === 200 && editorList.body.data.items.some((a) => a.id === draft.id),
    JSON.stringify(editorList.body?.error),
  );
  check(
    'and it is marked as auto-drafted rather than hand-written',
    editorList.body.data.items.find((a) => a.id === draft.id)?.competitionTargetId === adityaTarget,
  );

  check(
    'a Mentor cannot open the CMS article list, recording a win is not authorship',
    (await M('GET', '/site/articles')).status === 403,
  );
  check('a Secretary cannot either', (await S('GET', '/site/articles')).status === 403);
  check('nor a guardian', (await P('GET', `/site/articles/${draft.id}`)).status === 403);
  check(
    'nor an anonymous caller',
    (await ANON('GET', `/site/articles/${draft.id}`)).status === 401,
  );

  const publicMiss = await ANON('GET', `/public/articles/${draft.slug}`);
  check(
    'the draft is not on the public web',
    publicMiss.status === 404,
    'an article waiting for approval is often about a named child',
  );

  const sitemapBefore = await ANON('GET', '/public/sitemap');
  check(
    'and not in the sitemap',
    !sitemapBefore.body.data.items.some((e) => e.path === `/articles/${draft.slug}`),
  );

  // ═══ RLS directly ════════════════════════════════════════════════════
  console.log('\nRLS, without the API in the way');

  const asUser = (userId, fn) =>
    sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      return fn(tx);
    });

  check(
    'a guardian selects zero draft articles',
    (await asUser(guardian.id, (tx) => tx`SELECT id FROM articles WHERE id = ${draft.id}`))
      .length === 0,
    'RLS denies a read by returning no rows',
  );
  check(
    'a Mentor selects zero draft articles',
    (await asUser(mentor.id, (tx) => tx`SELECT id FROM articles WHERE id = ${draft.id}`)).length ===
      0,
  );
  const anonDraft = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
    await tx`SET LOCAL ROLE anon`;
    return tx`SELECT id FROM articles WHERE id = ${draft.id}`;
  });
  check('and anon selects zero', anonDraft.length === 0);

  // ═══ the consent gate ════════════════════════════════════════════════
  console.log('\nConsent (doc 13 §9.4)');

  await E('PATCH', `/site/content/article/${draft.id}`, {
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Editor menulis ceritanya di sini.' }],
        },
      ],
    },
  });

  /**
   * The byline is asked for at SUBMIT, not at publish: the only route out of
   * APPROVED is forward, so an approved article with an empty author would be
   * unpublishable and unfixable.
   */
  const noByline = await E('POST', `/site/content/article/${draft.id}/submit`, {});
  check(
    'the auto-draft cannot be submitted without a byline',
    noByline.status === 422 && noByline.body?.error?.code === 'AUTHOR_REQUIRED',
    JSON.stringify(noByline.body),
  );

  await E('PATCH', `/site/content/article/${draft.id}`, { authorId: editor.id });
  const submitted = await E('POST', `/site/content/article/${draft.id}/submit`, {});
  check(
    'an Editor can submit the generated draft through the normal pipeline',
    submitted.status === 200,
    JSON.stringify(submitted.body),
  );
  const approved = await H('POST', `/site/content/article/${draft.id}/approve`, {});
  check('and the Head approves it', approved.status === 200, JSON.stringify(approved.body));

  const blocked = await H('POST', `/site/content/article/${draft.id}/publish`, {});
  check(
    'but publishing WITHOUT consent is refused',
    blocked.status === 422 && blocked.body?.error?.code === 'CONSENT_REQUIRED',
    JSON.stringify(blocked.body),
  );
  const [stillDraft] =
    await sql`SELECT status::text AS status FROM articles WHERE id = ${draft.id}`;
  check(
    'and the article stays unpublished',
    stillDraft.status === 'APPROVED',
    `${stillDraft.status}, the protected state survives the denied transition`,
  );
  check(
    'still nothing public',
    (await ANON('GET', `/public/articles/${draft.slug}`)).status === 404,
  );

  /**
   * Consent is recorded through its own endpoint, at APPROVED, by the person
   * about to publish, not as a draft field. An APPROVED article is no longer
   * editable, and rejecting it back to DRAFT just to type one sentence would be
   * process punishing somebody for doing the check.
   */
  const editorConsent = await E('PUT', `/site/content/article/${draft.id}/consent`, {
    source: 'Editor mencoba mencatat izin sendiri',
  });
  check(
    'an Editor cannot record the consent. It is the publisher’s assertion',
    editorConsent.status === 403,
    String(editorConsent.status),
  );

  const consented = await H('PUT', `/site/content/article/${draft.id}/consent`, {
    source: 'WhatsApp Bunda Rani, 3 Agustus 2026',
  });
  check('the Head records it', consented.status === 200, JSON.stringify(consented.body));

  const published = await H('POST', `/site/content/article/${draft.id}/publish`, {});
  check(
    'with consent and an author, it publishes',
    published.status === 200,
    JSON.stringify(published.body),
  );

  // ═══ the public article ══════════════════════════════════════════════
  console.log('\nThe public article');

  const live = await ANON('GET', `/public/articles/${draft.slug}`);
  check('it is served at the ordinary article URL', live.status === 200, String(live.status));
  check(
    'the consent record is NOT in the public payload',
    live.body?.data && !('consentSource' in live.body.data) && !('consentAt' in live.body.data),
    JSON.stringify(Object.keys(live.body?.data ?? {})),
  );
  check(
    'and neither is the internal competition target id',
    live.body?.data && !('competitionTargetId' in live.body.data),
  );

  const sitemapAfter = await ANON('GET', '/public/sitemap');
  check(
    'the sitemap now lists it',
    sitemapAfter.body.data.items.some((e) => e.path === `/articles/${draft.slug}`),
  );

  const [versioned] = await sql`
    SELECT count(*)::int AS n FROM content_versions
    WHERE entity_type = 'article' AND entity_id = ${draft.id}`;
  check(
    'publishing wrote a version snapshot, like any article',
    versioned.n >= 1,
    String(versioned.n),
  );

  check(
    'a second achievement article was not created along the way',
    (await draftsFor(adityaTarget)).length === 1,
  );

  // ═══ permissions on the way out ══════════════════════════════════════
  console.log('\nPermissions');

  const mentorPublish = await M('POST', `/site/content/article/${scoredDraft.id}/publish`, {});
  check(
    'recording a win grants a Mentor no publishing power',
    mentorPublish.status === 403,
    String(mentorPublish.status),
  );
  const editorPublish = await E('POST', `/site/content/article/${scoredDraft.id}/publish`, {});
  check(
    'and an Editor still cannot publish their own work',
    editorPublish.status === 403,
    'content.publish belongs to whoever approves',
  );
  const secForge = await S('PATCH', `/competitions/${osn.id}/targets/${adityaTarget}`, {
    result: 'WINNER',
  });
  check(
    'a Secretary cannot forge a win to manufacture an article',
    secForge.status === 403,
    String(secForge.status),
  );
} finally {
  const sids = studentIds.filter(Boolean);
  if (sids.length) {
    const arts = await sql`SELECT id FROM articles WHERE student_id = ANY(${sids})`;
    const ids = arts.map((a) => a.id);
    if (ids.length) {
      await sql`DELETE FROM content_versions WHERE entity_type='article' AND entity_id = ANY(${ids})`;
      await sql`DELETE FROM seo_meta WHERE entity_type='article' AND entity_id = ANY(${ids})`;
      await sql`DELETE FROM media_usage WHERE entity_type='article' AND entity_id = ANY(${ids})`;
      await sql`DELETE FROM article_tags WHERE article_id = ANY(${ids})`;
      await sql`DELETE FROM articles WHERE id = ANY(${ids})`;
    }
    await sql`DELETE FROM competition_targets WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  if (competitionIds.length) {
    await sql`DELETE FROM competitions WHERE id = ANY(${competitionIds})`;
  }
  await sql`DELETE FROM audit_log WHERE entity IN ('article', 'competition_target')`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`UPDATE articles SET author_id = NULL WHERE author_id = ${id}`;
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
