import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The content pipeline, integration tests (doc 14 §2.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * The pipeline is meant to serve every future content type, so what is asserted
 * here is the machinery, not programmes: that illegal transitions are refused,
 * that approving is a different power from publishing, that a publish is atomic
 * with its snapshot, that two simultaneous publishes cannot both win, and that
 * a restore round-trips a row through JSON without corrupting an integer price
 * or a text[] column.
 *
 *   npm run dev       # in one terminal
 *   npm run test:cms  # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const JOBS = API.replace(/\/v1$/, '');
const CRON = required('CRON_SECRET');
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

const TAG = 'cms-test';
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`CMS ${tag}`})`;
  const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
  await sql`UPDATE users SET primary_role_id = ${roleId} WHERE id = ${created.user.id}`;
  const token = await retry(async () => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session.access_token;
  });
  return { id: created.user.id, token };
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

/** A fresh DRAFT programme to push through the pipeline. */
async function newProgram(suffix) {
  const [p] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status, summary)
    VALUES (${`${TAG}-${suffix}-${RUN}`}, ${`CMS ${suffix}`}, 'ACADEMIC', ARRAY['SMP','SMA'],
            500000, 'DRAFT', 'ringkasan awal')
    RETURNING id`;
  return p.id;
}

const accounts = [];
const coverIds = [];
const pageIds = [];
const faqIds = [];
const testimonialIds = [];
const mentorIds = [];
const bareArticleIds = [];

try {
  const head = await account('head', 'HEAD'); // review + publish
  const editor = await account('editor', 'EDITOR'); // neither verb
  const mentor = await account('mentor', 'MENTOR'); // no /site page
  accounts.push(head.id, editor.id, mentor.id);
  const H = api(head.token),
    E = api(editor.token),
    M = api(mentor.token);

  // ═══ Permissions & RLS ════════════════════════════════════════════
  console.log('\nPermissions');

  const noAuth = await api(null)('GET', '/site/content');
  check('unauthenticated is 401', noAuth.status === 401, `got ${noAuth.status}`);

  const mentorList = await M('GET', '/site/content');
  check('a Mentor has no /site page → 403', mentorList.status === 403, `got ${mentorList.status}`);

  const editorList = await E('GET', '/site/content');
  check('an Editor can open the CMS', editorList.status === 200, `got ${editorList.status}`);

  const id = await newProgram('flow');

  const editorApprove = await E('POST', `/site/content/program/${id}/approve`, {});
  check(
    'an Editor cannot approve. That is content.review',
    editorApprove.status === 403,
    `got ${editorApprove.status}`,
  );
  const editorPublish = await E('POST', `/site/content/program/${id}/publish`, {});
  check(
    'nor publish. That is content.publish',
    editorPublish.status === 403,
    `got ${editorPublish.status}`,
  );

  /**
   * RLS asserted directly, not through the API: the action guard and the policy
   * are two independent gates, and a test that only exercises the first cannot
   * tell whether the second exists.
   */
  let editorWrite = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: editor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`INSERT INTO content_versions (entity_type, entity_id, version, snapshot)
               VALUES ('program', ${id}, 999, '{}'::jsonb)`;
    });
  } catch (e) {
    // 42501 = insufficient_privilege. The catch must wrap the WHOLE
    // transaction: postgres.js aborts it on the failed statement, so a
    // .catch() on the inner query alone still rejects the outer promise.
    editorWrite = e.code;
  }
  check(
    'RLS blocks an Editor writing version history directly',
    editorWrite === '42501',
    String(editorWrite),
  );

  // ═══ Status transitions ═══════════════════════════════════════════
  console.log('\nStatus transitions');

  const earlyPublish = await H('POST', `/site/content/program/${id}/publish`, {});
  check(
    'a DRAFT cannot be published directly',
    earlyPublish.status === 409 && earlyPublish.body?.error?.code === 'ILLEGAL_TRANSITION',
    `${earlyPublish.status} ${JSON.stringify(earlyPublish.body?.error?.code)}`,
  );

  const submit = await E('POST', `/site/content/program/${id}/submit`, {});
  check('an author submits their own draft', submit.status === 200, `got ${submit.status}`);

  const noNote = await H('POST', `/site/content/program/${id}/reject`, {});
  check(
    'rejecting without a note is refused 422',
    noNote.status === 422 && noNote.body?.error?.code === 'NOTE_REQUIRED',
    `got ${noNote.status}`,
  );

  const reject = await H('POST', `/site/content/program/${id}/reject`, {
    note: 'Harga belum diperbarui.',
  });
  check('rejecting sends it back to DRAFT', reject.body?.data?.status === 'DRAFT');
  const [afterReject] = await sql`SELECT status, review_note FROM programs WHERE id = ${id}`;
  check(
    'with the reason recorded on the row',
    afterReject.review_note === 'Harga belum diperbarui.',
  );

  await E('POST', `/site/content/program/${id}/submit`, {});
  const approve = await H('POST', `/site/content/program/${id}/approve`, {});
  check('the Head approves', approve.body?.data?.status === 'APPROVED', `got ${approve.status}`);

  const doubleApprove = await H('POST', `/site/content/program/${id}/approve`, {});
  check('approving twice is refused 409', doubleApprove.status === 409);

  // ═══ Editing rules ════════════════════════════════════════════════
  console.log('\nOnly drafts are editable');

  const editApproved = await E('PATCH', `/site/content/program/${id}`, { summary: 'diam-diam' });
  check(
    'an approved item cannot be edited behind the reviewer',
    editApproved.status === 409 && editApproved.body?.error?.code === 'NOT_EDITABLE',
    `${editApproved.status} ${editApproved.body?.error?.code}`,
  );

  // ═══ Publish + version snapshot ═══════════════════════════════════
  console.log('\nPublishing');

  const publish = await H('POST', `/site/content/program/${id}/publish`, { note: 'Rilis pertama' });
  check('the Head publishes', publish.body?.data?.status === 'PUBLISHED', `got ${publish.status}`);

  const [live] =
    await sql`SELECT status, is_published, published_at, version FROM programs WHERE id = ${id}`;
  check('status is PUBLISHED', live.status === 'PUBLISHED');
  check('the generated is_published follows it', live.is_published === true);
  check('published_at is stamped', !!live.published_at);
  check('version incremented to 1', live.version === 1, String(live.version));

  const versions = await H('GET', `/site/content/program/${id}/versions`);
  check('a version was snapshotted', (versions.body?.data?.items ?? []).length === 1);
  check(
    'the snapshot records who and why',
    versions.body?.data?.items?.[0]?.authorName?.includes('CMS head') &&
      versions.body.data.items[0].note === 'Rilis pertama',
    JSON.stringify(versions.body?.data?.items?.[0]),
  );

  const [snap] = await sql`
    SELECT snapshot FROM content_versions WHERE entity_type='program' AND entity_id=${id} AND version=1`;
  check(
    'the snapshot captured the content',
    snap.snapshot.name === 'CMS flow',
    JSON.stringify(snap.snapshot).slice(0, 90),
  );

  const audited = await sql`
    SELECT action FROM audit_log WHERE entity='program' AND entity_id=${id} ORDER BY created_at`;
  const actions = audited.map((a) => a.action);
  for (const a of ['content.submit', 'content.reject', 'content.approve', 'content.publish']) {
    check(`audit records ${a}`, actions.includes(a), actions.join(','));
  }

  // ═══ Concurrent publish ═══════════════════════════════════════════
  console.log('\nTwo publishes racing');

  const raceId = await newProgram('race');
  await E('POST', `/site/content/program/${raceId}/submit`, {});
  await H('POST', `/site/content/program/${raceId}/approve`, {});

  const [a, b] = await Promise.all([
    H('POST', `/site/content/program/${raceId}/publish`, {}),
    H('POST', `/site/content/program/${raceId}/publish`, {}),
  ]);
  const statuses = [a.status, b.status].sort();
  check(
    'exactly one wins, the other gets 409',
    statuses[0] === 200 && statuses[1] === 409,
    statuses.join('/'),
  );
  const raceVersions = await sql`
    SELECT count(*)::int AS n FROM content_versions WHERE entity_type='program' AND entity_id=${raceId}`;
  check(
    'and only ONE version was written',
    raceVersions[0].n === 1,
    `${raceVersions[0].n} versions`,
  );

  // ═══ Version restore ══════════════════════════════════════════════
  console.log('\nVersion restore');

  await H('POST', `/site/content/program/${id}/unpublish`, {});
  await E('PATCH', `/site/content/program/${id}`, {
    summary: 'ringkasan baru',
    priceMonthly: 999000,
  });
  const [changed] = await sql`SELECT summary, price_monthly FROM programs WHERE id = ${id}`;
  check('the draft was edited', changed.price_monthly === 999000);

  const restore = await H('POST', `/site/content/program/${id}/restore`, { version: 1 });
  check('restore succeeds', restore.status === 200, JSON.stringify(restore.body?.error));

  const [restored] =
    await sql`SELECT summary, price_monthly, levels, status FROM programs WHERE id = ${id}`;
  check(
    'the old summary came back',
    restored.summary === 'ringkasan awal',
    String(restored.summary),
  );
  /**
   * The reason restore uses jsonb_populate_record. `snapshot ->> 'price'` is
   * text, and assigning it to an integer column is the kind of thing that
   * works until the day it does not.
   */
  check(
    'the integer price round-tripped',
    restored.price_monthly === 500000,
    String(restored.price_monthly),
  );
  check(
    'the text[] levels round-tripped',
    Array.isArray(restored.levels) && restored.levels.join(',') === 'SMP,SMA',
    JSON.stringify(restored.levels),
  );
  check('a restore lands as DRAFT, never straight to live', restored.status === 'DRAFT');
  check(
    'restore is audited',
    (await sql`SELECT 1 FROM audit_log WHERE entity_id=${id} AND action='content.restore'`)
      .length === 1,
  );

  const missingVersion = await H('POST', `/site/content/program/${id}/restore`, { version: 99 });
  check('restoring a version that does not exist is 404', missingVersion.status === 404);

  // ═══ Redirects on slug change ═════════════════════════════════════
  console.log('\nSlug governance');

  const [before] = await sql`SELECT slug FROM programs WHERE id = ${id}`;
  const newSlug = `${TAG}-renamed-${RUN}`;

  /**
   * Renaming a URL that has been live changes how the public web reaches the
   * site, so it needs the publishing verb. An author gets a sentence saying so
   * rather than an opaque failure from the redirects policy.
   */
  const authorRename = await E('PATCH', `/site/content/program/${id}`, { slug: newSlug });
  check(
    'an author cannot rename content that has been live',
    authorRename.status === 403 && authorRename.body?.error?.code === 'SLUG_CHANGE_NEEDS_PUBLISHER',
    `${authorRename.status} ${authorRename.body?.error?.code}`,
  );

  const rename = await H('PATCH', `/site/content/program/${id}`, { slug: newSlug });
  check('a publisher can', rename.status === 200, JSON.stringify(rename.body?.error));

  const [redirect] =
    await sql`SELECT to_path, status_code FROM redirects WHERE from_path = ${`/programs/${before.slug}`}`;
  check(
    'a 301 was written from the old URL',
    redirect?.to_path === `/programs/${newSlug}`,
    JSON.stringify(redirect),
  );
  check('with status 301', redirect?.status_code === 301);

  const neverPublished = await newProgram('fresh');
  await E('PATCH', `/site/content/program/${neverPublished}/`.replace(/\/$/, ''), {
    slug: `${TAG}-fresh-renamed-${RUN}`,
  });
  const noise =
    await sql`SELECT count(*)::int AS n FROM redirects WHERE from_path LIKE ${`/programs/${TAG}-fresh-${RUN}`}`;
  check(
    'renaming a never-published draft writes NO redirect',
    noise[0].n === 0,
    'a draft has no URL anyone could have linked to',
  );

  // ═══ Scheduling ═══════════════════════════════════════════════════
  console.log('\nScheduled publish');

  const schedId = await newProgram('sched');
  await E('POST', `/site/content/program/${schedId}/submit`, {});
  await H('POST', `/site/content/program/${schedId}/approve`, {});

  const past = await H('POST', `/site/content/program/${schedId}/schedule`, {
    publishAt: new Date(Date.now() - 60_000).toISOString(),
  });
  check(
    'scheduling in the past is refused 422',
    past.status === 422 && past.body?.error?.code === 'PUBLISH_AT_IN_PAST',
    `got ${past.status}`,
  );

  const noWhen = await H('POST', `/site/content/program/${schedId}/schedule`, {});
  check('scheduling without a time is refused 422', noWhen.status === 422);

  const sched = await H('POST', `/site/content/program/${schedId}/schedule`, {
    publishAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  check('scheduling succeeds', sched.body?.data?.status === 'SCHEDULED', `got ${sched.status}`);

  const cronEarly = await fetch(`${JOBS}/jobs/content-publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${CRON}` },
    body: '{}',
  });
  const early = await cronEarly.json();
  check(
    'the cron leaves a future schedule alone',
    !(early?.data?.published ?? []).some((p) => p.id === schedId),
  );

  // Bring the time forward and let the cron do the publishing.
  await sql`UPDATE programs SET publish_at = now() - interval '1 minute' WHERE id = ${schedId}`;
  const cronRun = await fetch(`${JOBS}/jobs/content-publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${CRON}` },
    body: '{}',
  });
  const ran = await cronRun.json();
  check(
    'the cron publishes what is due',
    (ran?.data?.published ?? []).some((p) => p.id === schedId),
    JSON.stringify(ran?.data),
  );
  const [afterCron] =
    await sql`SELECT status, publish_at, version FROM programs WHERE id = ${schedId}`;
  check('it is live', afterCron.status === 'PUBLISHED');
  check('publish_at is cleared so it cannot fire twice', afterCron.publish_at === null);
  const schedVersions = await sql`
    SELECT count(*)::int AS n FROM content_versions WHERE entity_type='program' AND entity_id=${schedId}`;
  check('a scheduled publish snapshots like a manual one', schedVersions[0].n === 1);

  const cronUnauth = await fetch(`${JOBS}/jobs/content-publish`);
  check(
    'the cron refuses an unauthenticated call',
    cronUnauth.status === 401,
    `${cronUnauth.status}`,
  );

  // ═══ SEO persistence ══════════════════════════════════════════════
  console.log('\nSEO overrides');

  const seoDenied = await E('PUT', `/site/content/program/${id}/seo`, { title: 'x' });
  check('an Editor cannot write SEO', seoDenied.status === 403, `got ${seoDenied.status}`);

  const seo = await H('PUT', `/site/content/program/${id}/seo`, {
    title: 'Olimpiade Sains. Metroscope',
    description: 'Bimbingan olimpiade untuk SMP dan SMA.',
    noindex: false,
  });
  check('the Head saves SEO', seo.status === 200, JSON.stringify(seo.body?.error));

  const readBack = await H('GET', `/site/content/program/${id}/seo`);
  check(
    'it persists and reads back',
    readBack.body?.data?.title === 'Olimpiade Sains. Metroscope',
    JSON.stringify(readBack.body?.data),
  );

  const seoUpdate = await H('PUT', `/site/content/program/${id}/seo`, { title: 'Judul baru' });
  check('saving again upserts rather than duplicating', seoUpdate.status === 200);
  const seoRows = await sql`SELECT count(*)::int AS n FROM seo_meta WHERE entity_id = ${id}`;
  check('still exactly one SEO row', seoRows[0].n === 1, `${seoRows[0].n} rows`);

  // ═══ Rollback ═════════════════════════════════════════════════════
  console.log('\nPublish is atomic');

  /**
   * Force the version INSERT to fail mid-publish by planting a row at the
   * version number the publish will try to use. The UNIQUE constraint aborts
   * the transaction, and the assertion is that NOTHING survives: no status
   * change, no half-written history.
   */
  const rollbackId = await newProgram('rollback');
  await E('POST', `/site/content/program/${rollbackId}/submit`, {});
  await H('POST', `/site/content/program/${rollbackId}/approve`, {});
  await sql`
    INSERT INTO content_versions (entity_type, entity_id, version, snapshot)
    VALUES ('program', ${rollbackId}, 1, '{"planted":true}'::jsonb)`;

  const boom = await H('POST', `/site/content/program/${rollbackId}/publish`, {});
  check('the publish fails', boom.status >= 400, `got ${boom.status}`);
  const [rolled] =
    await sql`SELECT status, version, published_at FROM programs WHERE id = ${rollbackId}`;
  check('the row is untouched, still APPROVED', rolled.status === 'APPROVED', rolled.status);
  check('version did not move', rolled.version === 0, String(rolled.version));
  check('published_at was not stamped', rolled.published_at === null);

  // ═══ Type registry ════════════════════════════════════════════════
  console.log('\nThe registry is closed');

  const unknownType = await H('POST', `/site/content/nonsense/${id}/publish`, {});
  check(
    'an unregistered content type is 404, never a table name',
    unknownType.status === 404 && unknownType.body?.error?.code === 'UNKNOWN_CONTENT_TYPE',
    `${unknownType.status} ${unknownType.body?.error?.code}`,
  );

  const listed = await H('GET', '/site/content?type=program&status=PUBLISHED&limit=100');
  check('listing filters by type and status', listed.status === 200, `got ${listed.status}`);
  check(
    'and every row comes back PUBLISHED',
    (listed.body?.data?.items ?? []).every((i) => i.status === 'PUBLISHED'),
  );
  // ═══ Programmes as CMS content (doc 14 §2.5) ══════════════════════
  console.log('\nProgrammes as CMS content');

  const [asset] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-cover-${RUN}.png`}, 'image/png', 'Sampul program', 'Kelas olimpiade', 'READY')
    RETURNING id`;
  coverIds.push(asset.id);

  const marketing = await newProgram('marketing');
  const patched = await H('PATCH', `/site/content/program/${marketing}`, {
    summary: 'Ringkasan pemasaran.',
    description: 'Paragraf pembuka di halaman program.',
    body: 'Paragraf satu.\n\nParagraf dua.',
    category: 'CREATIVE',
    levels: ['SD', 'SMP'],
    durationMonths: 6,
    cadence: '2x seminggu, 90 menit',
    priceMonthly: 1250000,
    coverId: asset.id,
  });
  check(
    'every marketing field is editable through the shared PATCH',
    patched.status === 200,
    JSON.stringify(patched.body),
  );

  const [saved] = await sql`
    SELECT category::text AS category, levels, duration_months, cadence,
           price_monthly, cover_id, updated_at, created_at
    FROM programs WHERE id = ${marketing}`;
  check(
    'the enum, the array and the money all round-trip',
    saved.category === 'CREATIVE' &&
      saved.levels.join(',') === 'SD,SMP' &&
      saved.duration_months === 6 &&
      saved.price_monthly === 1250000,
    JSON.stringify(saved),
  );
  check('the cover is stored as a media_assets reference', saved.cover_id === asset.id);
  check('updated_at moves on a draft edit', saved.updated_at > saved.created_at);

  const usage = await sql`
    SELECT asset_id, field FROM media_usage
    WHERE entity_type = 'program' AND entity_id = ${marketing}`;
  check(
    'and registers media_usage with field = cover',
    usage.length === 1 && usage[0].asset_id === asset.id && usage[0].field === 'cover',
    JSON.stringify(usage),
  );

  const blockedDelete = await H('DELETE', `/site/media/${asset.id}`);
  check(
    'media in use by a programme cannot be deleted',
    blockedDelete.status === 409,
    String(blockedDelete.status),
  );

  /**
   * The distinction the hook has to make: `undefined` means "not mentioned" and
   * must leave the cover alone; `null` means "removed". Treating them alike
   * would make a price change quietly release the hero image.
   */
  await H('PATCH', `/site/content/program/${marketing}`, { priceMonthly: 1300000 });
  const kept = await sql`
    SELECT count(*)::int n FROM media_usage
    WHERE entity_type = 'program' AND entity_id = ${marketing}`;
  check('an unrelated edit does not release the cover', kept[0].n === 1, String(kept[0].n));

  await H('PATCH', `/site/content/program/${marketing}`, { coverId: null });
  const cleared = await sql`
    SELECT count(*)::int n FROM media_usage
    WHERE entity_type = 'program' AND entity_id = ${marketing}`;
  check('clearing the cover releases it', cleared[0].n === 0, String(cleared[0].n));

  const ghost = await H('PATCH', `/site/content/program/${marketing}`, {
    coverId: '00000000-0000-4000-8000-000000000000',
  });
  check('an unknown media id is a 422, not a 500', ghost.status === 422, String(ghost.status));

  const forbiddenField = await H('PATCH', `/site/content/program/${marketing}`, {
    status: 'PUBLISHED',
  });
  check(
    'status is not an editable field',
    forbiddenField.status === 422,
    String(forbiddenField.status),
  );

  const editorRead = await H('GET', `/site/programs/${marketing}`);
  check(
    'the editor read is camelCase throughout',
    editorRead.body.data.priceMonthly !== undefined &&
      editorRead.body.data.durationMonths !== undefined &&
      editorRead.body.data.price_monthly === undefined,
    JSON.stringify(Object.keys(editorRead.body.data)),
  );

  const newProgramBody = {
    name: `${TAG} Program Baru ${RUN}`,
    category: 'ACADEMIC',
    levels: ['SMA'],
    priceMonthly: 900000,
  };
  const createdProgram = await H('POST', '/site/programs', newProgramBody);
  check(
    'a programme can be created from the CMS',
    createdProgram.status === 201,
    JSON.stringify(createdProgram.body),
  );
  check('and starts as a DRAFT', createdProgram.body.data.status === 'DRAFT');

  const dupe = await H('POST', '/site/programs', newProgramBody);
  check(
    'a duplicate slug is a 409, not a silent -2 suffix',
    dupe.status === 409,
    String(dupe.status),
  );

  const editorCreate = await E('POST', '/site/programs', {
    name: `${TAG} Editor Coba ${RUN}`,
    category: 'ACADEMIC',
    levels: ['SMA'],
    priceMonthly: 100000,
  });
  check(
    'an Editor cannot invent a priced offer',
    editorCreate.status === 403,
    String(editorCreate.status),
  );

  // ═══ The public programme surface ═════════════════════════════════
  console.log('\nThe public programme surface');

  const P = api(null);
  const [{ slug: marketingSlug }] = await sql`
    SELECT slug FROM programs WHERE id = ${marketing}`;

  check(
    'a draft programme 404s publicly',
    (await P('GET', `/public/programs/${marketingSlug}`)).status === 404,
  );

  const publicList = await P('GET', '/public/programs');
  check('the public list is anonymous-readable', publicList.status === 200);
  check(
    'and excludes drafts',
    !publicList.body.data.items.some((i) => i.slug === marketingSlug),
    JSON.stringify(publicList.body.data.items.map((i) => i.slug)),
  );

  await H('PATCH', `/site/content/program/${marketing}`, { coverId: asset.id });
  await H('POST', `/site/content/program/${marketing}/submit`, {});
  await H('POST', `/site/content/program/${marketing}/approve`, {});
  await H('POST', `/site/content/program/${marketing}/publish`, {});

  const publicOne = await P('GET', `/public/programs/${marketingSlug}`);
  check(
    'once published it is publicly readable',
    publicOne.status === 200,
    String(publicOne.status),
  );
  check(
    'with the marketing copy',
    publicOne.body.data.description === 'Paragraf pembuka di halaman program.',
  );
  check(
    'the price as an integer',
    publicOne.body.data.priceMonthly === 1300000,
    String(publicOne.body.data.priceMonthly),
  );
  check(
    'and the cover resolved to a public URL',
    typeof publicOne.body.data.coverUrl === 'string' &&
      publicOne.body.data.coverUrl.includes('/storage/v1/object/public/media/'),
    String(publicOne.body.data.coverUrl),
  );
  check(
    'timestamps are ISO 8601, as JSON-LD requires',
    /^\d{4}-\d{2}-\d{2}T.*Z$/.test(publicOne.body.data.publishedAt ?? ''),
    String(publicOne.body.data.publishedAt),
  );

  const leakedFields = ['reviewNote', 'reviewedById', 'status', 'version'].filter(
    (k) => publicOne.body.data[k] !== undefined,
  );
  check(
    'the public payload carries no editorial fields',
    leakedFields.length === 0,
    leakedFields.join(','),
  );

  const inList = await P('GET', '/public/programs');
  check(
    'the published programme appears in the list',
    inList.body.data.items.some((i) => i.slug === marketingSlug),
  );
  check(
    'and the list omits the long-form body',
    inList.body.data.items.every((i) => i.body === undefined),
    'a catalogue would otherwise ship every full programme description',
  );

  /** The registration picker reads this same endpoint. It must keep its shape. */
  const picker = inList.body.data.items.find((i) => i.slug === marketingSlug);
  check(
    'the picker still gets id, slug, name, levels and price',
    Boolean(picker.id && picker.slug && picker.name) &&
      Array.isArray(picker.levels) &&
      typeof picker.priceMonthly === 'number',
    JSON.stringify(picker),
  );

  await H('POST', `/site/content/program/${marketing}/unpublish`, {});
  check(
    'unpublishing removes it from the public API',
    (await P('GET', `/public/programs/${marketingSlug}`)).status === 404,
  );

  // ═══ Pages and blocks (doc 13 §9.3, doc 14 §2.6) ══════════════════
  console.log('\nPages and blocks');

  const [blockAsset] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-block-${RUN}.png`}, 'image/png', 'Gambar blok', 'Suasana kelas', 'READY')
    RETURNING id`;
  coverIds.push(blockAsset.id);

  const pageRes = await H('POST', '/site/pages', { title: `Tentang Kami ${RUN}` });
  check('a page can be created', pageRes.status === 201, JSON.stringify(pageRes.body));
  const pageId = pageRes.body.data.id;
  const pageSlug = pageRes.body.data.slug;
  pageIds.push(pageId);

  const dupePage = await H('POST', '/site/pages', { title: `Tentang Kami ${RUN}` });
  check('a duplicate page slug is a 409', dupePage.status === 409, String(dupePage.status));

  const mentorPage = await M('POST', '/site/pages', { title: 'Percobaan mentor' });
  check('a Mentor cannot create a page', mentorPage.status === 403, String(mentorPage.status));

  // ── block CRUD ──
  const hero = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'hero',
    props: { heading: 'Kami mendampingi sejak hari pertama', eyebrow: 'Tentang' },
  });
  check('a block can be added', hero.status === 201, JSON.stringify(hero.body));
  const heroId = hero.body.data.id;

  const badType = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'not_a_block',
    props: {},
  });
  check(
    'an unregistered block type is refused',
    badType.status === 422 && badType.body?.error?.code === 'UNKNOWN_BLOCK_TYPE',
    JSON.stringify(badType.body),
  );

  const badProps = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'hero',
    props: { heading: 'ok', bukanField: 'x' },
  });
  check(
    'unknown props are refused by the block schema',
    badProps.status === 422,
    String(badProps.status),
  );

  const badHref = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'cta_banner',
    props: { heading: 'Ayo', ctaLabel: 'Daftar', ctaHref: 'javascript:alert(1)' },
  });
  check('a javascript: link is refused', badHref.status === 422, String(badHref.status));

  const text = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'rich_text',
    props: { heading: 'Cerita kami', text: 'Paragraf satu.\n\nParagraf dua.' },
  });
  const textId = text.body.data.id;

  const mediaBlock = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'media',
    props: { mediaId: blockAsset.id, caption: 'Kelas olimpiade', width: 'wide' },
  });
  check('a media block can be added', mediaBlock.status === 201, JSON.stringify(mediaBlock.body));
  const mediaBlockId = mediaBlock.body.data.id;

  const ghostMedia = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'media',
    props: { mediaId: '00000000-0000-4000-8000-000000000000' },
  });
  check(
    'a block naming an unknown asset is a 422',
    ghostMedia.status === 422,
    String(ghostMedia.status),
  );

  // ── media usage from block props ──
  const blockUsage = await sql`
    SELECT asset_id, field FROM media_usage WHERE entity_type = 'page' AND entity_id = ${pageId}`;
  check(
    'a block image registers media_usage against the page',
    blockUsage.length === 1 && blockUsage[0].asset_id === blockAsset.id,
    JSON.stringify(blockUsage),
  );

  const blockedAssetDelete = await H('DELETE', `/site/media/${blockAsset.id}`);
  check(
    'an asset used by a block cannot be deleted',
    blockedAssetDelete.status === 409,
    String(blockedAssetDelete.status),
  );

  // ── ordering ──
  const listed1 = await H('GET', `/site/pages/${pageId}`);
  check(
    'blocks come back in insertion order',
    listed1.body.data.blocks.map((b) => b.type).join(',') === 'hero,rich_text,media',
    JSON.stringify(listed1.body.data.blocks.map((b) => b.type)),
  );

  const inserted = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'stat_row',
    props: { items: [{ value: '120', label: 'Siswa' }] },
    afterBlockId: heroId,
  });
  check('a block can be inserted after another', inserted.status === 201);
  const statId = inserted.body.data.id;

  const listed2 = await H('GET', `/site/pages/${pageId}`);
  check(
    'and lands in the right position without renumbering the rest',
    listed2.body.data.blocks.map((b) => b.type).join(',') === 'hero,stat_row,rich_text,media',
    JSON.stringify(listed2.body.data.blocks.map((b) => b.type)),
  );

  const reordered = await H('PUT', `/site/pages/${pageId}/blocks/reorder`, {
    blockIds: [mediaBlockId, heroId, textId, statId],
  });
  check('blocks can be reordered', reordered.status === 200, JSON.stringify(reordered.body));

  const listed3 = await H('GET', `/site/pages/${pageId}`);
  check(
    'the new order is exactly what was submitted',
    listed3.body.data.blocks.map((b) => b.id).join(',') ===
      [mediaBlockId, heroId, textId, statId].join(','),
    JSON.stringify(listed3.body.data.blocks.map((b) => b.type)),
  );

  const partial = await H('PUT', `/site/pages/${pageId}/blocks/reorder`, { blockIds: [heroId] });
  check(
    'a partial reorder is refused, not silently applied',
    partial.status === 422 && partial.body?.error?.code === 'BLOCK_SET_MISMATCH',
    JSON.stringify(partial.body),
  );

  // ── visibility windows ──
  await H('PATCH', `/site/pages/${pageId}/blocks/${statId}`, { visible: false });
  const hidden = await H('GET', `/site/pages/${pageId}`);
  check(
    'the editor still sees a hidden block',
    hidden.body.data.blocks.some((b) => b.id === statId && b.visible === false),
  );

  const badWindow = await H('PATCH', `/site/pages/${pageId}/blocks/${textId}`, {
    visibleFrom: '2030-01-02T00:00:00Z',
    visibleUntil: '2030-01-01T00:00:00Z',
  });
  check(
    'a window that ends before it starts is refused',
    badWindow.status >= 400,
    String(badWindow.status),
  );

  // ── preview: a draft page is not public, but is previewable ──
  console.log('\nPage preview');

  const P2 = api(null);
  check(
    'a draft page 404s publicly',
    (await P2('GET', `/public/pages/${pageSlug}`)).status === 404,
  );

  const grant = await H('POST', `/site/pages/${pageId}/preview`);
  check('a preview link can be minted', grant.status === 200, JSON.stringify(grant.body));
  const token = grant.body.data.token;

  const previewed = await P2('GET', `/public/preview?token=${encodeURIComponent(token)}`);
  check(
    'the token renders the unpublished page',
    previewed.status === 200,
    String(previewed.status),
  );
  check(
    'and preview shows hidden blocks the public read would drop',
    previewed.body.data.blocks.some((b) => b.id === statId),
    JSON.stringify(previewed.body.data.blocks.map((b) => b.type)),
  );

  const [stored] =
    await sql`SELECT token_hash FROM preview_grants ORDER BY created_at DESC LIMIT 1`;
  check(
    'the raw token is never stored',
    stored.token_hash !== token && stored.token_hash.length === 64,
    'a plaintext token in a staff-readable table is a working key to every draft',
  );

  const badToken = await P2('GET', '/public/preview?token=' + 'x'.repeat(40));
  check('an invalid token is a 404, not a hint', badToken.status === 404, String(badToken.status));

  await sql`UPDATE preview_grants SET expires_at = now() - interval '1 minute'
            WHERE entity_id = ${pageId}`;
  const expired = await P2('GET', `/public/preview?token=${encodeURIComponent(token)}`);
  check('an expired token stops working', expired.status === 404, String(expired.status));

  // ── the pipeline, unchanged ──
  console.log('\nPages use the shared pipeline');

  const editorPagePublish = await E('POST', `/site/content/page/${pageId}/publish`, {});
  check(
    'an Editor cannot publish a page',
    editorPagePublish.status === 403,
    String(editorPagePublish.status),
  );

  await H('POST', `/site/content/page/${pageId}/submit`, {});
  await H('POST', `/site/content/page/${pageId}/approve`, {});
  const publishedPage = await H('POST', `/site/content/page/${pageId}/publish`, {});
  check(
    'a page publishes through the shared pipeline',
    publishedPage.status === 200,
    JSON.stringify(publishedPage.body),
  );

  const liveBlocks = await H('POST', `/site/pages/${pageId}/blocks`, {
    type: 'rich_text',
    props: { text: 'Diam-diam ditambahkan.' },
  });
  check(
    'blocks cannot be added to a published page',
    liveBlocks.status === 409 && liveBlocks.body?.error?.code === 'NOT_EDITABLE',
    JSON.stringify(liveBlocks.body),
  );

  const liveEdit = await H('PATCH', `/site/pages/${pageId}/blocks/${heroId}`, {
    props: { heading: 'Diubah diam-diam' },
  });
  check('nor edited on a published page', liveEdit.status === 409, String(liveEdit.status));

  const publicPage = await P2('GET', `/public/pages/${pageSlug}`);
  check(
    'the published page is publicly readable',
    publicPage.status === 200,
    String(publicPage.status),
  );
  check(
    'and the public read drops hidden blocks',
    !publicPage.body.data.blocks.some((b) => b.id === statId),
    JSON.stringify(publicPage.body.data.blocks.map((b) => b.type)),
  );

  const pageVersions = await H('GET', `/site/content/page/${pageId}/versions`);
  check('publishing wrote a version', pageVersions.body.data.items.length === 1);

  // ── restore ──
  const restoredPage = await H('POST', `/site/content/page/${pageId}/restore`, { version: 1 });
  check(
    'a page restores to a draft of that version',
    restoredPage.status === 200,
    JSON.stringify(restoredPage.body),
  );
  const [afterRestore] = await sql`SELECT status::text AS status FROM pages WHERE id = ${pageId}`;
  check('and comes back as DRAFT', afterRestore.status === 'DRAFT', afterRestore.status);

  // ── redirects on rename ──
  const renamedPage = await H('PATCH', `/site/content/page/${pageId}`, {
    slug: `tentang-kami-baru-${RUN}`,
  });
  check('a publisher renames a page', renamedPage.status === 200, JSON.stringify(renamedPage.body));

  const [pageRedirect] = await sql`
    SELECT to_path, status_code FROM redirects WHERE from_path = ${`/${pageSlug}`}`;
  check(
    'the 301 uses the page public path',
    pageRedirect?.to_path === `/tentang-kami-baru-${RUN}` && pageRedirect.status_code === 301,
    JSON.stringify(pageRedirect),
  );

  // ── deleting a page releases its media ──
  const draftPage = await H('POST', '/site/pages', { title: `Halaman Sekali Pakai ${RUN}` });
  pageIds.push(draftPage.body.data.id);
  await H('POST', `/site/pages/${draftPage.body.data.id}/blocks`, {
    type: 'media',
    props: { mediaId: blockAsset.id },
  });
  const delPage = await H('DELETE', `/site/pages/${draftPage.body.data.id}`);
  check(
    'a never-published draft page is deletable',
    delPage.status === 200,
    JSON.stringify(delPage.body),
  );
  check(
    'and deleting it releases its media_usage',
    (
      await sql`SELECT count(*)::int n FROM media_usage WHERE entity_id = ${draftPage.body.data.id}`
    )[0].n === 0,
  );

  // ── RLS ──
  console.log('\nPage RLS');

  const anonPages = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
    await tx`SET LOCAL ROLE anon`;
    return tx`SELECT id FROM pages WHERE id = ${pageId}`;
  });
  check(
    'anon cannot read a page that is back in draft',
    anonPages.length === 0,
    JSON.stringify(anonPages),
  );

  let blockRls = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: mentor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`INSERT INTO page_blocks (page_id, type) VALUES (${pageId}, 'hero')`;
    });
  } catch (e) {
    blockRls = e.code;
  }
  check('RLS blocks a non-CMS account inserting a block', blockRls === '42501', String(blockRls));

  const anonBlocks = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
    await tx`SET LOCAL ROLE anon`;
    return tx`SELECT id FROM page_blocks WHERE page_id = ${pageId}`;
  });
  check(
    'and blocks of a draft page are invisible to anon',
    anonBlocks.length === 0,
    'the block policy defers to pages_select_public rather than restating it',
  );

  // ═══ FAQ, testimonials, mentors, contact (doc 14 §2.7) ════════════
  console.log('\nFAQ');

  const PUB = api(null);

  const faq = await H('POST', '/site/surfaces/faq', {
    question: `Berapa biaya per bulan ${RUN}?`,
    answer: 'Tergantung program. Rinciannya ada di halaman masing-masing.',
    category: 'Biaya',
  });
  check('an FAQ entry can be created', faq.status === 201, JSON.stringify(faq.body));
  const faqId = faq.body.data.id;
  faqIds.push(faqId);

  const mentorFaq = await M('POST', '/site/surfaces/faq', {
    question: 'Percobaan mentor',
    answer: 'Tidak boleh.',
  });
  check('a Mentor cannot create an FAQ entry', mentorFaq.status === 403, String(mentorFaq.status));

  check(
    'a draft FAQ entry is invisible publicly',
    (await PUB('GET', '/public/faq')).body.data.items.every((f) => f.id !== faqId),
  );

  await H('PATCH', `/site/content/faq/${faqId}`, { orderIndex: 5 });
  await H('POST', `/site/content/faq/${faqId}/submit`, {});
  await H('POST', `/site/content/faq/${faqId}/approve`, {});
  const faqPublished = await H('POST', `/site/content/faq/${faqId}/publish`, {});
  check(
    'an FAQ entry publishes through the shared pipeline',
    faqPublished.status === 200,
    JSON.stringify(faqPublished.body),
  );

  const publicFaq = await PUB('GET', '/public/faq');
  const mine = publicFaq.body.data.items.find((f) => f.id === faqId);
  check('and then appears publicly', Boolean(mine), String(publicFaq.status));
  check(
    'with its category and order',
    mine?.category === 'Biaya' && mine?.orderIndex === 5,
    JSON.stringify(mine),
  );

  /** Order is editor-chosen, not alphabetical, the persuasion sequence matters. */
  const second = await H('POST', '/site/surfaces/faq', {
    question: `Apakah ada uji coba ${RUN}?`,
    answer: 'Konsultasi awal gratis.',
  });
  faqIds.push(second.body.data.id);
  await H('PATCH', `/site/content/faq/${second.body.data.id}`, { orderIndex: 1 });
  await H('POST', `/site/content/faq/${second.body.data.id}/submit`, {});
  await H('POST', `/site/content/faq/${second.body.data.id}/approve`, {});
  await H('POST', `/site/content/faq/${second.body.data.id}/publish`, {});

  const ordered = (await PUB('GET', '/public/faq')).body.data.items.filter((f) =>
    faqIds.includes(f.id),
  );
  check(
    'entries come back in editor order, not alphabetical',
    ordered[0]?.id === second.body.data.id && ordered[1]?.id === faqId,
    JSON.stringify(ordered.map((f) => f.orderIndex)),
  );

  // ── testimonials ──
  console.log('\nTestimonials');

  const [photo] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-parent-${RUN}.png`}, 'image/png', 'Foto orang tua', 'Bunda Rani', 'READY')
    RETURNING id`;
  coverIds.push(photo.id);

  const testi = await H('POST', '/site/surfaces/testimonial', {
    quote: 'Anak saya jadi lebih percaya diri ikut lomba sejak dibimbing di sini.',
    authorName: `Bunda Rani ${RUN}`,
    authorRole: 'Orang tua Aditya, SMP',
  });
  check('a testimonial can be created', testi.status === 201, JSON.stringify(testi.body));
  const testiId = testi.body.data.id;
  testimonialIds.push(testiId);

  await H('PATCH', `/site/content/testimonial/${testiId}`, { photoId: photo.id });

  /**
   * A date field, through the API, while the row is still a draft, the path
   * that was a 500 until §2.7.
   *
   * The shared SET builder interpolated a `Date` straight in, so the driver
   * rendered it with `toString()` and Postgres rejected the timezone name. No
   * registered type had a date column before the consent record, so nothing had
   * ever exercised it.
   */
  const consentPatch = await H('PATCH', `/site/content/testimonial/${testiId}`, {
    consentSource: 'WA dari Bunda Rani, 12 Mei',
    consentAt: '2026-05-12',
  });
  check(
    'a draft patch carrying a date field succeeds',
    consentPatch.status === 200,
    JSON.stringify(consentPatch.body),
  );
  const [consentRow] = await sql`SELECT consent_at FROM testimonials WHERE id = ${testiId}`;
  check('and the date is stored', consentRow.consent_at !== null, String(consentRow.consent_at));

  /** Cleared again so the publish gate below is exercised on a real gap. */
  await sql`UPDATE testimonials SET consent_source = NULL WHERE id = ${testiId}`;
  const photoUsage = await sql`
    SELECT asset_id, field FROM media_usage WHERE entity_type = 'testimonial' AND entity_id = ${testiId}`;
  check(
    'its photo registers media_usage',
    photoUsage.length === 1 &&
      photoUsage[0].asset_id === photo.id &&
      photoUsage[0].field === 'photo',
    JSON.stringify(photoUsage),
  );
  check(
    'and the asset then cannot be deleted',
    (await H('DELETE', `/site/media/${photo.id}`)).status === 409,
  );

  /**
   * The consent gate. This is the one content type where a missing field is a
   * permission problem rather than a quality one.
   */
  await H('POST', `/site/content/testimonial/${testiId}/submit`, {});
  await H('POST', `/site/content/testimonial/${testiId}/approve`, {});
  const noConsent = await H('POST', `/site/content/testimonial/${testiId}/publish`, {});
  check(
    'a testimonial without a consent record cannot be published',
    noConsent.status === 422 && noConsent.body?.error?.code === 'CONSENT_REQUIRED',
    JSON.stringify(noConsent.body),
  );

  const [stillDraft] =
    await sql`SELECT status::text AS status FROM testimonials WHERE id = ${testiId}`;
  check(
    'and the refusal leaves the status untouched',
    stillDraft.status === 'APPROVED',
    stillDraft.status,
  );

  /** Restored by hand: the row is APPROVED now, so the API refuses an edit. */
  await sql`UPDATE testimonials SET consent_source = 'WA dari Bunda Rani, 12 Mei'
            WHERE id = ${testiId}`;
  const withConsent = await H('POST', `/site/content/testimonial/${testiId}/publish`, {});
  check(
    'with consent recorded it publishes',
    withConsent.status === 200,
    JSON.stringify(withConsent.body),
  );

  const publicTesti = await PUB('GET', '/public/testimonials');
  const t = publicTesti.body.data.items.find((x) => x.id === testiId);
  check('and appears publicly', Boolean(t), String(publicTesti.status));
  check(
    'with its photo resolved to a URL',
    typeof t?.photoUrl === 'string' && t.photoUrl.includes('/media/'),
  );
  check(
    'but NEVER the consent record',
    t?.consentSource === undefined && t?.consentAt === undefined,
    JSON.stringify(Object.keys(t ?? {})),
  );

  // ── mentors ──
  console.log('\nMentor profiles');

  const guardian = await account('parent', 'PARENT');
  accounts.push(guardian.id);
  const guardianMentor = await H('POST', '/site/surfaces/mentor', {
    userId: guardian.id,
    displayName: 'Bukan Mentor',
  });
  check(
    'a guardian account cannot be given a mentor profile',
    guardianMentor.status === 422 && guardianMentor.body?.error?.code === 'NOT_STAFF',
    JSON.stringify(guardianMentor.body),
  );

  const mentorRes = await H('POST', '/site/surfaces/mentor', {
    userId: mentor.id,
    displayName: `Kak Dinda ${RUN}`,
    headline: 'Mentor OSN Matematika',
  });
  check('a staff account can', mentorRes.status === 201, JSON.stringify(mentorRes.body));
  const mentorProfileId = mentorRes.body.data.id;
  const mentorSlug = mentorRes.body.data.slug;
  mentorIds.push(mentorProfileId);

  const editorMentor = await E('POST', '/site/surfaces/mentor', {
    userId: mentor.id,
    displayName: 'Coba lagi',
  });
  check(
    'an Editor cannot publish somebody as team',
    editorMentor.status === 403,
    String(editorMentor.status),
  );

  check(
    'a draft mentor profile 404s publicly',
    (await PUB('GET', `/public/mentors/${mentorSlug}`)).status === 404,
  );

  await H('PATCH', `/site/content/mentor/${mentorProfileId}`, {
    bio: 'Membimbing siswa OSN sejak 2019.',
    specialisms: ['OSN Matematika', 'Olimpiade Sains'],
  });
  await H('POST', `/site/content/mentor/${mentorProfileId}/submit`, {});
  await H('POST', `/site/content/mentor/${mentorProfileId}/approve`, {});
  await H('POST', `/site/content/mentor/${mentorProfileId}/publish`, {});

  const publicMentor = await PUB('GET', `/public/mentors/${mentorSlug}`);
  check(
    'once published it is publicly readable',
    publicMentor.status === 200,
    String(publicMentor.status),
  );
  check(
    'the text[] specialisms round-trip',
    publicMentor.body.data.specialisms?.join(',') === 'OSN Matematika,Olimpiade Sains',
    JSON.stringify(publicMentor.body.data.specialisms),
  );

  /**
   * The reason `mentor_profiles` is a separate table: the public payload must
   * carry nothing that identifies the ACCOUNT behind it.
   */
  const leakedMentor = ['userId', 'user_id', 'email', 'fullName', 'phone'].filter(
    (k) => publicMentor.body.data[k] !== undefined,
  );
  check(
    'and the payload carries no account fields',
    leakedMentor.length === 0,
    leakedMentor.join(','),
  );

  /**
   * There are TWO gates, and this asserts that neither one lets anon through.
   *
   * RLS denies a SELECT by returning NO ROWS rather than raising, only writes
   * raise 42501, which is why this used to assert emptiness. Migration 0024
   * closed the second gate: Supabase's default ACL had granted `anon` full DML
   * on every table in `public`, so RLS was the only thing standing here. With
   * the grant revoked the same query now raises 42501 instead, and both
   * outcomes are correct answers to "can anon read accounts". Accepting either
   * is what keeps this assertion true through the change rather than pinned to
   * whichever gate happens to answer first.
   */
  const anonUsers = await sql
    .begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
      await tx`SET LOCAL ROLE anon`;
      return tx`SELECT id FROM users LIMIT 1`;
    })
    .catch((e) => (e.code === '42501' ? 'denied' : Promise.reject(e)));
  check(
    'anon still sees no users at all',
    anonUsers === 'denied' || anonUsers.length === 0,
    `${anonUsers.length} rows, the mentor page must never be a window onto accounts`,
  );

  // ── the contact form ──
  console.log('\nContact form');

  /**
   * The public endpoint is capped at five messages per IP per hour, and that
   * cap is real protection worth keeping. Driving the inbox assertions through
   * it made the suite unrunnable twice in an hour, the same trap
   * `test:leads` documents for the registration form.
   *
   * So the endpoint gets its own assertions and is allowed to say "already
   * proven today", while the inbox fixture is inserted directly.
   */
  const contact = await PUB('POST', '/public/contact', {
    name: 'Ibu Sari',
    email: `sari-${RUN}@example.test`,
    message: 'Saya ingin tahu jadwal kelas debat untuk SMP.',
    sourcePath: '/contact',
  });

  if (contact.status === 429) {
    console.log('  SKIP  public contact submit, rate limited (5/hour by design)');
  } else {
    check(
      'an anonymous visitor can send a message',
      contact.status === 201,
      JSON.stringify(contact.body),
    );
    check(
      'and the response is only an acknowledgement',
      JSON.stringify(contact.body.data) === JSON.stringify({ received: true }),
      JSON.stringify(contact.body.data),
    );
    check(
      'the message reaches the inbox table',
      (
        await sql`SELECT count(*)::int n FROM form_submissions
                 WHERE email = ${`sari-${RUN}@example.test`}`
      )[0].n === 1,
    );

    const noContactDetails = await PUB('POST', '/public/contact', {
      name: 'Tanpa Kontak',
      message: 'Pesan tanpa cara membalas sama sekali.',
    });
    check(
      'a message with no way to reply is refused',
      noContactDetails.status === 422,
      String(noContactDetails.status),
    );

    /** The honeypot answers success and stores nothing, a bot told "no" retries. */
    const honeypot = await PUB('POST', '/public/contact', {
      name: 'Bot',
      email: `bot-${RUN}@example.test`,
      message: 'Pesan otomatis dari robot yang mengisi semua kolom.',
      website: 'http://spam.example',
    });
    check(
      'a honeypot submission looks successful',
      honeypot.status === 201,
      String(honeypot.status),
    );
    check(
      'but stores nothing',
      (
        await sql`SELECT count(*)::int n FROM form_submissions
                 WHERE email = ${`bot-${RUN}@example.test`}`
      )[0].n === 0,
    );
  }

  /**
   * The rate limit itself, asserted directly rather than as a side effect:
   * six messages in a row must not all be accepted.
   */
  const burst = [];
  for (let i = 0; i < 6; i += 1) {
    burst.push(
      (
        await PUB('POST', '/public/contact', {
          name: 'Beruntun',
          email: `burst-${RUN}-${i}@example.test`,
          message: 'Pesan beruntun untuk menguji batas pengiriman.',
        })
      ).status,
    );
  }
  check(
    'the endpoint rate limits a burst',
    burst.includes(429),
    burst.join(',') + ', five per hour per address',
  );

  /** Inbox fixture, inserted directly so the suite is repeatable. */
  await sql`
    INSERT INTO form_submissions (kind, name, email, message, source_path)
    VALUES ('CONTACT', 'Ibu Fixture', ${`fixture-${RUN}@example.test`},
            'Pesan fixture untuk kotak masuk.', '/contact')`;

  /** Either gate may answer, see the note on `anonUsers` above (0024). */
  const anonSubs = await sql
    .begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
      await tx`SET LOCAL ROLE anon`;
      return tx`SELECT id FROM form_submissions LIMIT 1`;
    })
    .catch((e) => (e.code === '42501' ? 'denied' : Promise.reject(e)));
  check(
    'anon reads no submissions',
    anonSubs === 'denied' || anonSubs.length === 0,
    `${anonSubs.length} rows, a readable submissions table is a harvestable contact list`,
  );

  let anonWrite = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
      await tx`SET LOCAL ROLE anon`;
      await tx`INSERT INTO form_submissions (name, email, message)
               VALUES ('x', 'x@example.test', 'langsung lewat PostgREST')`;
    });
  } catch (e) {
    anonWrite = e.code;
  }
  check(
    'nor write it directly, bypassing the rate limit',
    anonWrite === '42501',
    String(anonWrite),
  );

  const inbox = await H('GET', '/site/forms');
  check('staff can read the inbox', inbox.status === 200, String(inbox.status));
  check(
    'and see the message',
    inbox.body.data.items.some((i) => i.email === `fixture-${RUN}@example.test`),
  );

  const mentorInbox = await M('GET', '/site/forms');
  check('a Mentor cannot, no /leads page', mentorInbox.status === 403, String(mentorInbox.status));

  const submissionId = inbox.body.data.items.find(
    (i) => i.email === `fixture-${RUN}@example.test`,
  )?.id;
  const handled = await H('PATCH', `/site/forms/${submissionId}`, { handled: true });
  check('a message can be marked handled', handled.status === 200, JSON.stringify(handled.body));

  const editorHandle = await E('PATCH', `/site/forms/${submissionId}`, { handled: false });
  check(
    'an Editor cannot work the inbox',
    editorHandle.status === 403,
    String(editorHandle.status),
  );

  // ── the article excerpt guard, added with the same hook ──
  console.log('\nThe beforeTransition hook');

  const bare = await H('POST', '/site/articles', { title: `Tanpa Ringkasan ${RUN}` });
  bareArticleIds.push(bare.body?.data?.id);
  const bareSubmit = await H('POST', `/site/content/article/${bare.body.data.id}/submit`, {});
  check(
    'an article without an excerpt cannot be submitted',
    bareSubmit.status === 422 && bareSubmit.body?.error?.code === 'EXCERPT_REQUIRED',
    JSON.stringify(bareSubmit.body),
  );
  await H('PATCH', `/site/content/article/${bare.body.data.id}`, { excerpt: 'Sekarang ada.' });
  check(
    'and can once it has one',
    (await H('POST', `/site/content/article/${bare.body.data.id}/submit`, {})).status === 200,
  );
} finally {
  console.log('\nCleaning up…');
  const progs = await sql`SELECT id, slug FROM programs WHERE slug LIKE ${`${TAG}%`}`;
  const ids = progs.map((p) => p.id);
  if (ids.length) {
    await sql`DELETE FROM content_versions WHERE entity_id = ANY(${ids})`;
    await sql`DELETE FROM seo_meta WHERE entity_id = ANY(${ids})`;
    await sql`DELETE FROM audit_log WHERE entity_id = ANY(${ids.map(String)})`;
    await sql`DELETE FROM topics WHERE program_id = ANY(${ids})`;
    await sql`DELETE FROM media_usage WHERE entity_type = 'program' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM programs WHERE id = ANY(${ids})`;
  }
  await sql`DELETE FROM redirects WHERE from_path LIKE ${`/programs/${TAG}%`}`;
  const livePages = pageIds.filter(Boolean);
  if (livePages.length) {
    await sql`DELETE FROM media_usage WHERE entity_type = 'page' AND entity_id = ANY(${livePages})`;
    await sql`DELETE FROM content_versions WHERE entity_type = 'page' AND entity_id = ANY(${livePages})`;
    await sql`DELETE FROM seo_meta WHERE entity_type = 'page' AND entity_id = ANY(${livePages})`;
    await sql`DELETE FROM audit_log WHERE entity = 'page' AND entity_id = ANY(${livePages.map(String)})`;
    await sql`DELETE FROM preview_grants WHERE entity_id = ANY(${livePages})`;
    await sql`DELETE FROM pages WHERE id = ANY(${livePages})`;
  }
  await sql`DELETE FROM redirects WHERE from_path LIKE ${`/tentang-kami%`}`;
  await sql`DELETE FROM form_submissions WHERE email LIKE ${`%-${RUN}@example.test`}`;
  for (const [table, ids, entity] of [
    ['faq_entries', faqIds, 'faq'],
    ['testimonials', testimonialIds, 'testimonial'],
    ['mentor_profiles', mentorIds, 'mentor'],
    ['articles', bareArticleIds, 'article'],
  ]) {
    const live = ids.filter(Boolean);
    if (!live.length) continue;
    await sql`DELETE FROM media_usage WHERE entity_type = ${entity} AND entity_id = ANY(${live})`;
    await sql`DELETE FROM content_versions WHERE entity_type = ${entity} AND entity_id = ANY(${live})`;
    await sql`DELETE FROM audit_log WHERE entity = ${entity} AND entity_id = ANY(${live.map(String)})`;
    await sql.unsafe(`DELETE FROM ${table} WHERE id = ANY($1)`, [live]);
  }
  await sql`DELETE FROM redirects WHERE from_path LIKE '/mentors/%'`;
  if (coverIds.length) {
    await sql`DELETE FROM media_usage WHERE asset_id = ANY(${coverIds})`;
    await sql`DELETE FROM audit_log WHERE entity = 'media' AND entity_id = ANY(${coverIds.map(String)})`;
    await sql`DELETE FROM media_assets WHERE id = ANY(${coverIds})`;
  }
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM content_versions WHERE author_id = ${id}`;
    await sql`UPDATE programs SET reviewed_by_id = NULL WHERE reviewed_by_id = ${id}`;
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
