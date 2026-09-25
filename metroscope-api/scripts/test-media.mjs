import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Media library, integration tests (doc 14 §2.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * Uploads go through the real signed-URL round trip against real Supabase
 * Storage, because the seam worth testing is exactly the one a mock removes:
 * the row exists before the bytes do, and the interesting failures live in the
 * gap between those two facts.
 *
 *   npm run dev         # in one terminal
 *   npm run test:media  # in another
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

const TAG = 'media-test';
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Media ${tag}`})`;
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

/** A tiny but genuinely valid PNG, so storage accepts real bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Upload to a signed URL exactly as the browser would. */
async function putBytes(uploadUrl, bytes, contentType = 'image/png') {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: bytes,
  });
  return res.status;
}

const accounts = [];
const assetIds = [];

try {
  const head = await account('head', 'HEAD'); // content.publish
  const editor = await account('editor', 'EDITOR'); // /site, no verbs
  const mentor = await account('mentor', 'MENTOR'); // no /site
  accounts.push(head.id, editor.id, mentor.id);
  const H = api(head.token),
    E = api(editor.token),
    M = api(mentor.token);

  // ═══ Permissions & RLS ════════════════════════════════════════════
  console.log('\nPermissions');

  check('unauthenticated is 401', (await api(null)('GET', '/site/media')).status === 401);
  check('a Mentor has no /site page → 403', (await M('GET', '/site/media')).status === 403);
  check('an Editor can browse the library', (await E('GET', '/site/media')).status === 200);

  let rlsCode = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: mentor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`INSERT INTO media_assets (storage_key, mime_type, title)
               VALUES (${`${TAG}-rls-${RUN}.png`}, 'image/png', 'sneaky')`;
    });
  } catch (e) {
    rlsCode = e.code;
  }
  check('RLS blocks a non-CMS account inserting an asset', rlsCode === '42501', String(rlsCode));

  // ═══ Invalid files ════════════════════════════════════════════════
  console.log('\nInvalid files are refused before a URL is issued');

  const svg = await E('POST', '/site/media', {
    filename: 'logo.svg',
    mimeType: 'image/svg+xml',
    sizeBytes: 500,
  });
  check(
    'SVG is refused. It is a scriptable document on our own origin',
    svg.status === 422,
    `got ${svg.status}`,
  );

  const exe = await E('POST', '/site/media', {
    filename: 'x.exe',
    mimeType: 'application/x-msdownload',
    sizeBytes: 500,
  });
  check('an executable is refused', exe.status === 422, `got ${exe.status}`);

  const huge = await E('POST', '/site/media', {
    filename: 'big.png',
    mimeType: 'image/png',
    sizeBytes: 50 * 1024 * 1024,
  });
  check('an oversized file is refused', huge.status === 422, `got ${huge.status}`);

  const empty = await E('POST', '/site/media', {
    filename: 'empty.png',
    mimeType: 'image/png',
    sizeBytes: 0,
  });
  check('a zero-byte file is refused', empty.status === 422, `got ${empty.status}`);

  const badFolder = await E('POST', '/site/media', {
    filename: 'a.png',
    mimeType: 'image/png',
    sizeBytes: 10,
    folder: '../escape',
  });
  check('a traversal folder is refused', badFolder.status === 422, `got ${badFolder.status}`);

  // ═══ Upload ═══════════════════════════════════════════════════════
  console.log('\nUpload');

  const req = await E('POST', '/site/media', {
    filename: 'hero.png',
    mimeType: 'image/png',
    sizeBytes: PNG.length,
    title: 'Hero uji',
    folder: `${TAG}`,
    checksum: `sum-${RUN}`,
  });
  check('an author gets an upload URL', req.status === 201, JSON.stringify(req.body?.error));
  const assetId = req.body?.data?.assetId;
  if (assetId) assetIds.push(assetId);
  check('a signed URL is returned', typeof req.body?.data?.uploadUrl === 'string');
  check(
    'the storage key is server-chosen, not the filename',
    !String(req.body?.data?.storageKey ?? '').endsWith('hero.png'),
    String(req.body?.data?.storageKey),
  );

  const [pending] = await sql`SELECT status FROM media_assets WHERE id = ${assetId}`;
  check('the row starts PENDING, before any bytes exist', pending.status === 'PENDING');

  const notYet = await E('GET', `/site/media?limit=100`);
  check(
    'a PENDING asset is invisible in the library',
    !(notYet.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  /**
   * Confirming before the bytes land must fail. Without this check a broken
   * upload joins the library looking completely normal.
   */
  const earlyConfirm = await E('POST', `/site/media/${assetId}/confirm`, {});
  check(
    'confirming before the upload lands is refused',
    earlyConfirm.status === 422 && earlyConfirm.body?.error?.code === 'UPLOAD_NOT_FOUND',
    `${earlyConfirm.status} ${earlyConfirm.body?.error?.code}`,
  );

  check('the bytes upload to the signed URL', (await putBytes(req.body.data.uploadUrl, PNG)) < 400);

  const confirm = await E('POST', `/site/media/${assetId}/confirm`, { width: 1, height: 1 });
  check('confirming succeeds', confirm.status === 200, JSON.stringify(confirm.body?.error));
  check('the asset is READY', confirm.body?.data?.status === 'READY');
  check(
    'with a public URL',
    String(confirm.body?.data?.url ?? '').includes('/object/public/media/'),
  );

  const publicFetch = await fetch(confirm.body.data.url);
  check(
    'and the file really is publicly readable',
    publicFetch.status === 200,
    `${publicFetch.status}`,
  );

  const reconfirm = await E('POST', `/site/media/${assetId}/confirm`, {});
  check('confirming twice is idempotent', reconfirm.status === 200);

  // ═══ The alt-text gate ════════════════════════════════════════════
  console.log('\nAlt text gates placement, not upload');

  check('an image without alt is not "ready to place"', confirm.body?.data?.isReady === false);

  const missingAlt = await E('GET', '/site/media?missingAlt=true&limit=100');
  check(
    'and appears in the missing-alt filter',
    (missingAlt.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  const described = await E('PATCH', `/site/media/${assetId}`, {
    alt: 'Siswa Metroscope menerima medali olimpiade',
  });
  check('an author can write alt text', described.status === 200);
  check('which makes it placeable', described.body?.data?.isReady === true);

  const stillMissing = await E('GET', '/site/media?missingAlt=true&limit=100');
  check(
    'and removes it from the backlog',
    !(stillMissing.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  // ═══ Metadata ═════════════════════════════════════════════════════
  console.log('\nMetadata');

  const meta = await E('PATCH', `/site/media/${assetId}`, {
    caption: 'Foto oleh tim Metroscope',
    focalX: 0.25,
    focalY: 0.75,
  });
  check('caption and focal point save', meta.status === 200);
  check(
    'focal point round-trips',
    meta.body?.data?.focalX === 0.25 && meta.body?.data?.focalY === 0.75,
  );

  const badFocal = await E('PATCH', `/site/media/${assetId}`, { focalX: 5 });
  check('a focal point outside 0–1 is refused', badFocal.status === 422, `got ${badFocal.status}`);

  const noop = await E('PATCH', `/site/media/${assetId}`, {});
  check('an empty patch is refused', noop.status === 422);

  const audited = await sql`
    SELECT action FROM audit_log WHERE entity = 'media' AND entity_id = ${assetId}`;
  const actions = audited.map((a) => a.action);
  check('upload is audited', actions.includes('media.upload'), actions.join(','));
  check('metadata edits are audited', actions.filter((a) => a === 'media.update').length >= 2);

  // ═══ Search & filter ══════════════════════════════════════════════
  console.log('\nSearch and filtering');

  const byText = await E('GET', `/site/media?q=${encodeURIComponent('Hero uji')}&limit=100`);
  check(
    'search by title finds it',
    (byText.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  const byAlt = await E('GET', '/site/media?q=medali&limit=100');
  check(
    'search also covers alt text',
    (byAlt.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  const byFolder = await E('GET', `/site/media?folder=${TAG}&limit=100`);
  check(
    'filter by folder',
    (byFolder.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  const byKind = await E('GET', '/site/media?kind=pdf&limit=100');
  check(
    'filter by kind excludes images',
    !(byKind.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  const noMatch = await E('GET', '/site/media?q=zzz-nothing-matches-zzz');
  check(
    'a search with no matches is empty, not an error',
    (noMatch.body?.data?.items ?? []).length === 0,
  );

  // ═══ Dedupe & concurrency ═════════════════════════════════════════
  console.log('\nDuplicate and concurrent uploads');

  const dupe = await E('POST', '/site/media', {
    filename: 'hero-again.png',
    mimeType: 'image/png',
    sizeBytes: PNG.length,
    checksum: `sum-${RUN}`,
  });
  check(
    're-uploading the same file returns the existing asset',
    dupe.body?.data?.deduplicated === true,
  );
  check('and does not create a second row', dupe.body?.data?.asset?.id === assetId);

  /**
   * Concurrent uploads must not collide. Each gets its own server-chosen key,
   * so five at once produce five distinct assets rather than one overwritten
   * object, the failure mode of naming objects after the uploaded filename.
   */
  const concurrent = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      E('POST', '/site/media', {
        filename: `same-name.png`,
        mimeType: 'image/png',
        sizeBytes: PNG.length,
        title: `Concurrent ${n}`,
        folder: TAG,
      }),
    ),
  );
  const keys = concurrent.map((c) => c.body?.data?.storageKey);
  for (const c of concurrent) if (c.body?.data?.assetId) assetIds.push(c.body.data.assetId);
  check(
    'five simultaneous uploads all succeed',
    concurrent.every((c) => c.status === 201),
  );
  check('each gets a distinct storage key', new Set(keys).size === 5, keys.join(' '));

  await Promise.all(concurrent.map((c) => putBytes(c.body.data.uploadUrl, PNG)));
  const confirms = await Promise.all(
    concurrent.map((c) => E('POST', `/site/media/${c.body.data.assetId}/confirm`, {})),
  );
  check(
    'and all confirm independently',
    confirms.every((c) => c.status === 200),
  );

  // ═══ Replace ══════════════════════════════════════════════════════
  console.log('\nReplace keeps the id so references follow');

  const editorReplace = await E('POST', `/site/media/${assetId}/replace`, {
    filename: 'new.png',
    mimeType: 'image/png',
    sizeBytes: PNG.length,
  });
  check(
    'an author cannot replace. It changes every place at once',
    editorReplace.status === 403,
    `got ${editorReplace.status}`,
  );

  const [{ storage_key: oldKey }] =
    await sql`SELECT storage_key FROM media_assets WHERE id = ${assetId}`;

  const rep = await H('POST', `/site/media/${assetId}/replace`, {
    filename: 'new.png',
    mimeType: 'image/png',
    sizeBytes: PNG.length,
  });
  check('a publisher gets a replace URL', rep.status === 200, JSON.stringify(rep.body?.error));
  check('with a NEW key, not an overwrite', rep.body?.data?.storageKey !== oldKey);

  await putBytes(rep.body.data.uploadUrl, PNG);
  const repDone = await H('POST', `/site/media/${assetId}/replace/confirm`, {
    storageKey: rep.body.data.storageKey,
    mimeType: 'image/png',
    sizeBytes: PNG.length,
    width: 1,
    height: 1,
  });
  check('the replace completes', repDone.status === 200, JSON.stringify(repDone.body?.error));
  check('the asset id is unchanged', repDone.body?.data?.id === assetId);
  check('pointing at the new object', repDone.body?.data?.storageKey === rep.body.data.storageKey);
  check('alt text survives a replace', repDone.body?.data?.alt?.includes('medali'));
  check(
    'replace is audited',
    (await sql`SELECT 1 FROM audit_log WHERE entity_id = ${assetId} AND action = 'media.replace'`)
      .length === 1,
  );

  const { data: oldGone } = await supabase.storage.from('media').list(TAG, { limit: 200 });
  check(
    'the superseded object is removed from the bucket',
    !(oldGone ?? []).some((f) => `${TAG}/${f.name}` === oldKey),
    'a replaced file left behind is billable storage nobody can reach',
  );

  // ═══ Deletion rules ═══════════════════════════════════════════════
  console.log('\nDeletion rules');

  const editorDelete = await E('DELETE', `/site/media/${assetId}`);
  check('an author cannot delete', editorDelete.status === 403, `got ${editorDelete.status}`);

  // Register usage, as a future content type would.
  await sql`
    INSERT INTO media_usage (asset_id, entity_type, entity_id, field)
    VALUES (${assetId}, 'article', ${crypto.randomUUID()}, 'cover')`;

  const usage = await H('GET', `/site/media/${assetId}/usage`);
  check(
    'usage is listed',
    (usage.body?.data?.items ?? []).length === 1,
    JSON.stringify(usage.body?.data),
  );

  const blocked = await H('DELETE', `/site/media/${assetId}`);
  check(
    'deleting something in use is refused 409',
    blocked.status === 409 && blocked.body?.error?.code === 'MEDIA_IN_USE',
    `${blocked.status} ${blocked.body?.error?.code}`,
  );

  const purgeLive = await H('POST', `/site/media/${assetId}/purge`);
  check(
    'purging something not in the bin is refused',
    purgeLive.status === 409 && purgeLive.body?.error?.code === 'NOT_DELETED',
    `${purgeLive.status} ${purgeLive.body?.error?.code}`,
  );

  const forced = await H('DELETE', `/site/media/${assetId}?force=true`);
  check('forcing works when the caller has seen the list', forced.status === 200);

  const [soft] = await sql`SELECT deleted_at FROM media_assets WHERE id = ${assetId}`;
  check('it is a SOFT delete, the row survives', !!soft.deleted_at);

  const gone = await E('GET', '/site/media?limit=100');
  check('and it leaves the library', !(gone.body?.data?.items ?? []).some((i) => i.id === assetId));

  const bin = await E('GET', '/site/media?deleted=true&limit=100');
  check(
    'but appears in the recycle bin',
    (bin.body?.data?.items ?? []).some((i) => i.id === assetId),
  );

  const stillServed = await fetch(
    `${required('NEXT_PUBLIC_SUPABASE_URL')}/storage/v1/object/public/media/${rep.body.data.storageKey}`,
  );
  check('the bytes still exist while soft-deleted', stillServed.status === 200);

  const restored = await H('POST', `/site/media/${assetId}/restore`);
  check(
    'restore brings it back',
    restored.status === 200 && restored.body?.data?.deletedAt === null,
  );

  // Purge needs both: in the bin, and unused.
  await sql`DELETE FROM media_usage WHERE asset_id = ${assetId}`;
  await H('DELETE', `/site/media/${assetId}`);
  const purged = await H('POST', `/site/media/${assetId}/purge`);
  check(
    'purge succeeds once binned and unused',
    purged.status === 200,
    JSON.stringify(purged.body?.error),
  );

  const [{ n: rowsLeft }] =
    await sql`SELECT count(*)::int AS n FROM media_assets WHERE id = ${assetId}`;
  check('the row is gone for real', rowsLeft === 0);

  /**
   * The ORIGIN object, not the URL.
   *
   * Fetching the public URL after a purge still returns 200, the bucket is
   * served through a CDN, and the edge keeps serving a copy after the origin
   * object is gone. Proven rather than assumed: a key that never existed
   * returns 400, while the purged one returned 200, which only happens when
   * something cached it.
   *
   * So the assertion is against storage itself. The caching behaviour is a real
   * property of the product and is recorded in doc 08 §7, "delete" does not
   * mean "immediately unreachable", which matters for photographs of children.
   */
  const { data: remaining } = await supabase.storage.from('media').list(TAG, { limit: 200 });
  const purgedName = rep.body.data.storageKey.slice(rep.body.data.storageKey.lastIndexOf('/') + 1);
  check(
    'and the bytes are gone from the bucket',
    !(remaining ?? []).some((f) => f.name === purgedName),
    (remaining ?? []).map((f) => f.name).join(','),
  );

  // ═══ Storage failures ═════════════════════════════════════════════
  console.log('\nStorage failures surface honestly');

  const orphan = await E('POST', '/site/media', {
    filename: 'never-uploaded.png',
    mimeType: 'image/png',
    sizeBytes: PNG.length,
    folder: TAG,
  });
  if (orphan.body?.data?.assetId) assetIds.push(orphan.body.data.assetId);
  const orphanConfirm = await E('POST', `/site/media/${orphan.body.data.assetId}/confirm`, {});
  check(
    'an upload that never arrives cannot be confirmed',
    orphanConfirm.status === 422 && orphanConfirm.body?.error?.code === 'UPLOAD_NOT_FOUND',
    `${orphanConfirm.status} ${orphanConfirm.body?.error?.code}`,
  );
  const [stuck] = await sql`SELECT status FROM media_assets WHERE id = ${orphan.body.data.assetId}`;
  check('and it stays PENDING rather than joining the library', stuck.status === 'PENDING');

  const missing = await H('GET', `/site/media/${crypto.randomUUID()}`);
  check('an unknown asset is 404', missing.status === 404);

  const malformed = await H('GET', '/site/media/not-a-uuid');
  check('a malformed id is 400, not a 500', malformed.status === 400, `got ${malformed.status}`);
} finally {
  console.log('\nCleaning up…');
  const assets = await sql`
    SELECT id, storage_key FROM media_assets
    WHERE storage_key LIKE ${`${TAG}%`} OR id = ANY(${assetIds.length ? assetIds : [crypto.randomUUID()]})`;
  const keys = assets.map((a) => a.storage_key);
  if (keys.length)
    await supabase.storage
      .from('media')
      .remove(keys)
      .catch(() => {});
  if (assets.length) {
    const ids = assets.map((a) => a.id);
    await sql`DELETE FROM media_usage WHERE asset_id = ANY(${ids})`;
    await sql`DELETE FROM audit_log WHERE entity = 'media' AND entity_id = ANY(${ids.map(String)})`;
    await sql`DELETE FROM media_assets WHERE id = ANY(${ids})`;
  }
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`UPDATE media_assets SET uploaded_by_id = NULL WHERE uploaded_by_id = ${id}`;
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
