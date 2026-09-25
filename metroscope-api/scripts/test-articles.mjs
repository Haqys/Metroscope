import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Article system, integration tests (doc 14 §2.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev            # in one terminal
 *   npm run test:articles  # in another
 *
 * The point of this suite is that articles are NOT a second CMS. Everything
 * editorial, submit, approve, publish, version, restore, 301, is exercised
 * through `/site/content/article/...`, the same endpoints programmes use. If
 * any of that needed an article-specific route, 2.1's abstraction would have
 * failed and these tests would be hitting it.
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

const TAG = 'article-test';
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Article ${tag}`})`;
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

/** A TipTap document with `words` words and optional embedded images. */
const doc = (words, mediaIds = []) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: Array.from({ length: words }, () => 'kata').join(' ') }],
    },
    ...mediaIds.map((mediaId) => ({
      type: 'image',
      attrs: { mediaId, src: `/media/${mediaId}`, alt: 'gambar' },
    })),
  ],
});

const accounts = [];
const articleIds = [];
const assetIds = [];
const categoryIds = [];
const tagIds = [];

try {
  const head = await account('head', 'HEAD'); // content.review + content.publish
  const editor = await account('editor', 'EDITOR'); // /site, no verbs
  const mentor = await account('mentor', 'MENTOR'); // no /site at all
  accounts.push(head.id, editor.id, mentor.id);
  const H = api(head.token),
    E = api(editor.token),
    M = api(mentor.token);

  /** Two real media rows, so cover and embed tests exercise real ids. */
  const [coverA] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-cover-a-${RUN}.png`}, 'image/png', 'Cover A', 'Sampul A', 'READY')
    RETURNING id`;
  const [coverB] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-cover-b-${RUN}.png`}, 'image/png', 'Cover B', 'Sampul B', 'READY')
    RETURNING id`;
  const [inline] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-inline-${RUN}.png`}, 'image/png', 'Inline', 'Sisip', 'READY')
    RETURNING id`;
  assetIds.push(coverA.id, coverB.id, inline.id);

  // ═══ Permissions ══════════════════════════════════════════════════
  console.log('\nPermissions');

  check('unauthenticated is 401', (await api(null)('GET', '/site/articles')).status === 401);
  check('a Mentor has no /site → 403', (await M('GET', '/site/articles')).status === 403);
  check('an Editor can list articles', (await E('GET', '/site/articles')).status === 200);
  check(
    'a Mentor cannot create an article',
    (await M('POST', '/site/articles', { title: 'Percobaan mentor' })).status === 403,
  );

  // ═══ Create & slugs ═══════════════════════════════════════════════
  console.log('\nCreate and slug management');

  const title = `Juara 1 OSN Matematika ${RUN}`;
  const a1 = await E('POST', '/site/articles', { title });
  check('an Editor creates a draft', a1.status === 201, JSON.stringify(a1.body));
  articleIds.push(a1.body?.data?.id);
  const id1 = a1.body.data.id;
  const expectedSlug = `juara-1-osn-matematika-${RUN}`;
  check('slug is derived from the title', a1.body.data.slug === expectedSlug, a1.body.data.slug);
  check('a new article starts as DRAFT', a1.body.data.status === 'DRAFT');

  const a2 = await E('POST', '/site/articles', { title });
  articleIds.push(a2.body?.data?.id);
  const id2 = a2.body.data.id;
  check(
    'a duplicate title gets a -2 suffix, not a 409',
    a2.status === 201 && a2.body.data.slug === `${expectedSlug}-2`,
    a2.body.data.slug,
  );

  const a3 = await E('POST', '/site/articles', { title });
  articleIds.push(a3.body?.data?.id);
  check('a third collision counts on to -3', a3.body.data.slug === `${expectedSlug}-3`);

  const punct = await E('POST', '/site/articles', {
    title: `  Tips & Trik: Lomba "Sains"!! ${RUN}  `,
  });
  articleIds.push(punct.body?.data?.id);
  check(
    'punctuation and spacing collapse to a clean slug',
    punct.body.data.slug === `tips-trik-lomba-sains-${RUN}`,
    punct.body.data.slug,
  );

  const [authored] = await sql`SELECT author_id FROM articles WHERE id = ${id1}`;
  check('the byline defaults to the author', authored.author_id === editor.id);

  // ═══ Draft editing through the shared pipeline ════════════════════
  console.log('\nDraft editing (the 2.1 pipeline, unchanged)');

  const patch = await E('PATCH', `/site/content/article/${id1}`, {
    subtitle: 'Dari Bali untuk Indonesia',
    excerpt: 'Cerita perjalanan menuju medali emas.',
    body: doc(420),
  });
  check(
    'an Editor edits their draft via the generic route',
    patch.status === 200,
    JSON.stringify(patch.body),
  );

  const [read] = await sql`SELECT reading_min, subtitle, body FROM articles WHERE id = ${id1}`;
  check('reading time is computed server-side', read.reading_min === 3, String(read.reading_min));
  check(
    'the body is stored as jsonb, not a string',
    typeof read.body === 'object' && read.body.type === 'doc',
  );

  const spoof = await E('PATCH', `/site/content/article/${id1}`, { readingMin: 99 });
  check('a client-supplied reading time is rejected', spoof.status === 422, String(spoof.status));

  const badField = await E('PATCH', `/site/content/article/${id1}`, { status: 'PUBLISHED' });
  check('status is not an editable field', badField.status === 422, String(badField.status));

  const badBody = await E('PATCH', `/site/content/article/${id1}`, { body: { type: 'paragraph' } });
  check('a body that is not a doc is refused', badBody.status === 422, String(badBody.status));

  const deep = { type: 'doc', content: [] };
  let cursor = deep;
  for (let i = 0; i < 30; i++) {
    cursor.content = [{ type: 'blockquote', content: [] }];
    cursor = cursor.content[0];
  }
  const deepRes = await E('PATCH', `/site/content/article/${id1}`, { body: deep });
  check('an absurdly nested body is refused', deepRes.status === 422, String(deepRes.status));

  // ═══ Categories ═══════════════════════════════════════════════════
  console.log('\nCategories');

  const cats = await E('GET', '/site/categories');
  check(
    'the seeded categories are listed',
    cats.status === 200 && cats.body.data.items.length >= 6,
  );

  const catDenied = await E('POST', '/site/categories', { name: `Kategori Editor ${RUN}` });
  check('an Editor cannot invent a category', catDenied.status === 403, String(catDenied.status));

  const cat = await H('POST', '/site/categories', {
    name: `Liputan Khusus ${RUN}`,
    description: 'Kategori uji',
    orderIndex: 90,
  });
  check('a reviewer creates a category', cat.status === 201, JSON.stringify(cat.body));
  categoryIds.push(cat.body?.data?.id);
  const catId = cat.body.data.id;
  check('the category slug is derived', cat.body.data.slug === `liputan-khusus-${RUN}`);

  const rename = await H('PATCH', `/site/categories/${catId}`, {
    name: `Liputan Khusus ${RUN}`,
    orderIndex: 5,
  });
  check('a reviewer renames a category', rename.status === 200);

  await E('PATCH', `/site/content/article/${id1}`, { categoryId: catId });
  const catBusy = await H('DELETE', `/site/categories/${catId}`);
  check(
    'a category in use cannot be deleted',
    catBusy.status === 409 && /1 artikel/.test(catBusy.body?.error?.message ?? ''),
    JSON.stringify(catBusy.body),
  );

  const catCount = await E('GET', '/site/categories');
  const mine = catCount.body.data.items.find((c) => c.id === catId);
  check(
    'the category reports its article count',
    mine?.articleCount === 1,
    String(mine?.articleCount),
  );

  // ═══ Tags ═════════════════════════════════════════════════════════
  console.log('\nTags');

  const t1 = await E('POST', '/site/tags', { name: `OSN ${RUN}` });
  check(
    'an Editor creates a tag while writing',
    t1.status === 200 && t1.body.data.created === true,
  );
  tagIds.push(t1.body?.data?.id);

  const t1again = await E('POST', '/site/tags', { name: `  osn ${RUN}  ` });
  check(
    'a differently-cased duplicate returns the same tag',
    t1again.body.data.id === t1.body.data.id && t1again.body.data.created === false,
    JSON.stringify(t1again.body.data),
  );

  const t2 = await E('POST', '/site/tags', { name: `Matematika ${RUN}` });
  tagIds.push(t2.body?.data?.id);

  const tagPatch = await E('PATCH', `/site/content/article/${id1}`, {
    tagIds: [t1.body.data.id, t2.body.data.id],
  });
  check(
    'tags attach through the generic draft PATCH',
    tagPatch.status === 200,
    JSON.stringify(tagPatch.body),
  );

  const tagged = await sql`SELECT tag_id FROM article_tags WHERE article_id = ${id1}`;
  check('both tags are stored', tagged.length === 2, String(tagged.length));

  await E('PATCH', `/site/content/article/${id1}`, { tagIds: [t2.body.data.id] });
  const retagged = await sql`SELECT tag_id FROM article_tags WHERE article_id = ${id1}`;
  check(
    'removing a tag removes the row',
    retagged.length === 1 && retagged[0].tag_id === t2.body.data.id,
  );

  const [touched] =
    await sql`SELECT updated_at > created_at AS moved FROM articles WHERE id = ${id1}`;
  check('a tag-only edit still moves updated_at', touched.moved === true);

  const tagDenied = await E('DELETE', `/site/tags/${t1.body.data.id}`);
  check('an Editor cannot delete a tag', tagDenied.status === 403, String(tagDenied.status));

  // ═══ Media usage ══════════════════════════════════════════════════
  console.log('\nMedia library integration (2.2, no new media APIs)');

  const cov = await E('PATCH', `/site/content/article/${id1}`, { coverId: coverA.id });
  check('a cover is set from the library', cov.status === 200, JSON.stringify(cov.body));

  let usage = await sql`
    SELECT asset_id, field FROM media_usage WHERE entity_type = 'article' AND entity_id = ${id1}`;
  check(
    'the cover registers media_usage with field = cover',
    usage.length === 1 && usage[0].asset_id === coverA.id && usage[0].field === 'cover',
    JSON.stringify(usage),
  );

  const blocked = await H('DELETE', `/site/media/${coverA.id}`);
  check('media in use cannot be deleted', blocked.status === 409, String(blocked.status));

  await E('PATCH', `/site/content/article/${id1}`, { body: doc(420, [inline.id]) });
  usage = await sql`
    SELECT asset_id, field FROM media_usage
    WHERE entity_type = 'article' AND entity_id = ${id1} ORDER BY field`;
  check(
    'an embedded image registers alongside the cover',
    usage.length === 2 &&
      usage.some((u) => u.asset_id === inline.id && u.field === 'body') &&
      usage.some((u) => u.asset_id === coverA.id && u.field === 'cover'),
    JSON.stringify(usage),
  );

  await E('PATCH', `/site/content/article/${id1}`, { coverId: coverB.id });
  usage = await sql`
    SELECT asset_id FROM media_usage
    WHERE entity_type = 'article' AND entity_id = ${id1} AND field = 'cover'`;
  check(
    'replacing the cover releases the old asset',
    usage.length === 1 && usage[0].asset_id === coverB.id,
    JSON.stringify(usage),
  );
  check(
    'the released asset becomes deletable again',
    (await sql`SELECT count(*)::int n FROM media_usage WHERE asset_id = ${coverA.id}`)[0].n === 0,
  );

  await E('PATCH', `/site/content/article/${id1}`, { body: doc(420) });
  check(
    'removing an embed releases its usage row',
    (await sql`SELECT count(*)::int n FROM media_usage WHERE asset_id = ${inline.id}`)[0].n === 0,
  );

  const ghost = await E('PATCH', `/site/content/article/${id1}`, {
    coverId: '00000000-0000-4000-8000-000000000000',
  });
  check('an unknown media id is a 422, not a 500', ghost.status === 422, String(ghost.status));

  const [stillB] = await sql`SELECT cover_id FROM articles WHERE id = ${id1}`;
  check('the failed cover change rolled back', stillB.cover_id === coverB.id);

  // ═══ Publishing workflow ══════════════════════════════════════════
  console.log('\nPublishing workflow (shared pipeline)');

  const earlyPublish = await E('POST', `/site/content/article/${id1}/publish`, {});
  check(
    'an Editor cannot publish directly',
    earlyPublish.status === 403,
    String(earlyPublish.status),
  );

  const submit = await E('POST', `/site/content/article/${id1}/submit`, {});
  check('an Editor submits for review', submit.status === 200, JSON.stringify(submit.body));

  const editLocked = await E('PATCH', `/site/content/article/${id1}`, {
    title: 'Diam-diam diubah',
  });
  check(
    'an in-review article is not editable',
    editLocked.status === 409,
    String(editLocked.status),
  );

  const reject = await H('POST', `/site/content/article/${id1}/reject`, {
    note: 'Tambahkan kutipan mentor.',
  });
  check('a reviewer can send it back', reject.status === 200, JSON.stringify(reject.body));

  await E('POST', `/site/content/article/${id1}/submit`, {});
  const approve = await H('POST', `/site/content/article/${id1}/approve`, {});
  check('a reviewer approves it', approve.status === 200, JSON.stringify(approve.body));

  const publish = await H('POST', `/site/content/article/${id1}/publish`, {});
  check('a publisher publishes it', publish.status === 200, JSON.stringify(publish.body));

  const [live] = await sql`SELECT status, version, published_at FROM articles WHERE id = ${id1}`;
  check('the article is PUBLISHED at version 1', live.status === 'PUBLISHED' && live.version === 1);
  check('published_at is stamped', live.published_at !== null);

  const versions = await H('GET', `/site/content/article/${id1}/versions`);
  check(
    'a version snapshot exists',
    versions.body.data.items.length === 1,
    JSON.stringify(versions.body),
  );
  check(
    'the version list returns metadata only, not the payload',
    versions.body.data.items[0].snapshot === undefined,
  );

  /**
   * The snapshot itself is read from the table: it is a restore target, and
   * what matters is that the registry captured ARTICLE columns, a snapshot
   * carrying only the columns programmes share would restore an empty article.
   */
  const [snap] = await sql`
    SELECT snapshot FROM content_versions WHERE entity_type = 'article' AND entity_id = ${id1}`;
  check(
    'the snapshot captured article-shaped columns',
    snap.snapshot.title !== undefined &&
      snap.snapshot.reading_min !== undefined &&
      snap.snapshot.body?.type === 'doc' &&
      snap.snapshot.cover_id !== undefined,
    JSON.stringify(Object.keys(snap.snapshot ?? {})),
  );

  const restored = await H('POST', `/site/content/article/${id1}/restore`, { version: 1 });
  check(
    'a published article restores to a draft of that version',
    restored.status === 200,
    JSON.stringify(restored.body),
  );
  const [afterRestore] = await sql`SELECT status, title FROM articles WHERE id = ${id1}`;
  check(
    'and comes back as DRAFT with its text intact',
    afterRestore.status === 'DRAFT' && afterRestore.title.startsWith('Juara 1 OSN'),
    JSON.stringify(afterRestore),
  );
  await H('POST', `/site/content/article/${id1}/submit`, {});
  await H('POST', `/site/content/article/${id1}/approve`, {});
  await H('POST', `/site/content/article/${id1}/publish`, {});

  const listed = await E('GET', '/site/content?type=article');
  check(
    'the cross-type list renders an article title',
    listed.body.data.items.some((i) => i.id === id1 && i.title?.startsWith('Juara 1 OSN')),
    JSON.stringify(listed.body.data.items.slice(0, 2)),
  );

  // ═══ Slug changes and redirects ═══════════════════════════════════
  console.log('\nSlug changes and 301s');

  await H('POST', `/site/content/article/${id1}/unpublish`, {});
  const slugDenied = await E('PATCH', `/site/content/article/${id1}`, { slug: `curi-${RUN}` });
  check(
    'an Editor cannot rename a URL that has been live',
    slugDenied.status === 403 && slugDenied.body?.error?.code === 'SLUG_CHANGE_NEEDS_PUBLISHER',
    JSON.stringify(slugDenied.body),
  );

  const newSlug = `juara-osn-2026-${RUN}`;
  const renamed = await H('PATCH', `/site/content/article/${id1}`, { slug: newSlug });
  check('a publisher renames it', renamed.status === 200, JSON.stringify(renamed.body));

  const [redirect] = await sql`
    SELECT from_path, to_path, status_code FROM redirects WHERE from_path = ${`/articles/${expectedSlug}`}`;
  /**
   * `/articles/`, per doc 13 §19.1, not `/artikel/`, which is what the
   * registry wrote until §2.4 built the page that has to serve the target.
   */
  check(
    'a 301 from the old article URL was written',
    redirect?.to_path === `/articles/${newSlug}` && redirect.status_code === 301,
    JSON.stringify(redirect),
  );

  const nonSlug = await H('PATCH', `/site/content/article/${id2}`, { slug: `bebas-${RUN}` });
  check('a never-published draft renames with no redirect', nonSlug.status === 200);
  check(
    'and writes no 301',
    (
      await sql`SELECT count(*)::int n FROM redirects WHERE to_path = ${`/articles/bebas-${RUN}`}`
    )[0].n === 0,
  );

  // ═══ Preview ══════════════════════════════════════════════════════
  console.log('\nPreview');

  const preview = await E('GET', `/site/articles/${id2}`);
  check('an Editor previews an unpublished draft', preview.status === 200, String(preview.status));
  check('the preview carries the body AST', preview.body.data.body?.type === 'doc');
  check('and the resolved tag list', Array.isArray(preview.body.data.tags));

  /**
   * The detail response speaks camelCase like every other endpoint.
   *
   * Caught in the browser: `SELECT a.*` returned the database's snake_case, so
   * the editor read `undefined` for reading time, cover and category and
   * rendered them blank, indistinguishable from an article with no data.
   */
  const full = await E('GET', `/site/articles/${id1}`);
  check(
    'the detail response is camelCase throughout',
    full.body.data.readingMin !== undefined &&
      full.body.data.coverId !== undefined &&
      full.body.data.categoryId !== undefined &&
      full.body.data.publishedAt !== undefined &&
      full.body.data.reading_min === undefined &&
      full.body.data.cover_id === undefined,
    JSON.stringify(Object.keys(full.body.data)),
  );
  check(
    'and resolves the cover to a public URL',
    typeof full.body.data.coverUrl === 'string' && full.body.data.coverUrl.includes('/media/'),
    String(full.body.data.coverUrl),
  );

  const previewDenied = await M('GET', `/site/articles/${id2}`);
  check(
    'a Mentor cannot preview a draft',
    previewDenied.status === 403,
    String(previewDenied.status),
  );

  // ═══ Search and filters ═══════════════════════════════════════════
  console.log('\nSearch and filters');

  const found = await E('GET', `/site/articles?q=${encodeURIComponent('Juara OSN')}`);
  check(
    'full-text search finds the article by title',
    found.body.data.items.some((i) => i.id === id1),
    JSON.stringify(found.body.data.items.map((i) => i.title)),
  );

  const byCat = await E('GET', `/site/articles?categoryId=${catId}`);
  check(
    'filtering by category works',
    byCat.body.data.items.every((i) => i.categoryId === catId),
  );

  const byTag = await E('GET', `/site/articles?tagId=${t2.body.data.id}`);
  check(
    'filtering by tag works',
    byTag.body.data.items.length >= 1 && byTag.body.data.items.some((i) => i.id === id1),
  );

  const injected = await E(
    'GET',
    `/site/articles?q=${encodeURIComponent("x'; DROP TABLE articles;--")}`,
  );
  check(
    'a hostile search string is just a search string',
    injected.status === 200 &&
      (await sql`SELECT to_regclass('public.articles') AS t`)[0].t === 'articles',
  );

  // ═══ Deletion ═════════════════════════════════════════════════════
  console.log('\nDeletion');

  const delLive = await H('DELETE', `/site/articles/${id1}`);
  check(
    'an article that has been published cannot be deleted',
    delLive.status === 409 && delLive.body?.error?.code === 'NOT_DELETABLE',
    JSON.stringify(delLive.body),
  );

  const delDenied = await E('DELETE', `/site/articles/${id2}`);
  check('an Editor cannot delete an article', delDenied.status === 403, String(delDenied.status));

  await H('PATCH', `/site/content/article/${id2}`, { coverId: coverA.id });
  const delDraft = await H('DELETE', `/site/articles/${id2}`);
  check(
    'a never-published draft is deletable',
    delDraft.status === 200,
    JSON.stringify(delDraft.body),
  );
  check(
    'deleting a draft releases its media_usage',
    (await sql`SELECT count(*)::int n FROM media_usage WHERE entity_id = ${id2}`)[0].n === 0,
  );

  // ═══ Concurrency ══════════════════════════════════════════════════
  console.log('\nConcurrent edits');

  const a4 = await E('POST', '/site/articles', { title: `Balapan ${RUN}` });
  articleIds.push(a4.body?.data?.id);
  const id4 = a4.body.data.id;
  await E('PATCH', `/site/content/article/${id4}`, { excerpt: 'x', body: doc(50) });
  await E('POST', `/site/content/article/${id4}/submit`, {});
  await H('POST', `/site/content/article/${id4}/approve`, {});

  const race = await Promise.all([
    H('POST', `/site/content/article/${id4}/publish`, {}),
    H('POST', `/site/content/article/${id4}/publish`, {}),
  ]);
  const codes = race.map((r) => r.status).sort();
  check(
    'two simultaneous publishes: one wins, one 409s',
    codes[0] === 200 && codes[1] === 409,
    codes.join(','),
  );
  check(
    'and exactly one version row exists',
    (
      await sql`SELECT count(*)::int n FROM content_versions
               WHERE entity_type = 'article' AND entity_id = ${id4}`
    )[0].n === 1,
  );

  const a5 = await E('POST', '/site/articles', { title: `Tabrakan Tag ${RUN}` });
  articleIds.push(a5.body?.data?.id);
  const id5 = a5.body.data.id;
  const bothTags = [t1.body.data.id, t2.body.data.id];
  const tagRace = await Promise.all([
    E('PATCH', `/site/content/article/${id5}`, { tagIds: bothTags }),
    E('PATCH', `/site/content/article/${id5}`, { tagIds: bothTags }),
  ]);
  check(
    'concurrent identical tag writes do not duplicate rows',
    tagRace.every((r) => r.status === 200) &&
      (await sql`SELECT count(*)::int n FROM article_tags WHERE article_id = ${id5}`)[0].n === 2,
    tagRace.map((r) => r.status).join(','),
  );

  // ═══ RLS ══════════════════════════════════════════════════════════
  console.log('\nRow Level Security');

  const asAnon = async (fn) =>
    sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
      await tx`SET LOCAL ROLE anon`;
      return fn(tx);
    });

  const anonRows = await asAnon(
    (tx) => tx`SELECT id, status FROM articles WHERE id IN (${id1}, ${id4})`,
  );
  check(
    'anon sees the published article and not the unpublished one',
    anonRows.length === 1 && anonRows[0].id === id4,
    JSON.stringify(anonRows),
  );

  let code = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: mentor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`INSERT INTO articles (title, slug) VALUES ('Sisipan', ${`sisip-${RUN}`})`;
    });
  } catch (e) {
    code = e.code;
  }
  check('RLS blocks a non-CMS account inserting an article', code === '42501', String(code));

  code = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: editor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`UPDATE articles SET status = 'PUBLISHED' WHERE id = ${id5}`;
    });
  } catch (e) {
    code = e.code;
  }
  check(
    'RLS blocks an Editor publishing by direct SQL, not just via the API',
    code === '42501',
    String(code),
  );

  code = 'no error';
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: editor.id, role: 'authenticated' })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`INSERT INTO article_categories (name, slug) VALUES ('Selundupan', ${`selundup-${RUN}`})`;
    });
  } catch (e) {
    code = e.code;
  }
  check('RLS blocks an Editor creating a category directly', code === '42501', String(code));

  const anonCats = await asAnon((tx) => tx`SELECT count(*)::int n FROM article_categories`);
  check('anon can read the taxonomy (the public site needs it)', anonCats[0].n >= 6);

  // ═══ Audit ════════════════════════════════════════════════════════
  console.log('\nAudit trail');

  const audits = await sql`
    SELECT action FROM audit_log WHERE entity = 'article' AND entity_id = ${id1} ORDER BY created_at`;
  const actions = audits.map((a) => a.action);
  check(
    'creation, review and publication are all audited',
    actions.includes('content.create') &&
      actions.includes('content.submit') &&
      actions.includes('content.publish'),
    actions.join(','),
  );
  /**
   * Two publishes happened (the second after a version restore), so exactly two
   * rows. The bug this guards is the double-audit found in 2.1, where the
   * handler and the service each wrote one row per transition.
   */
  check(
    'each transition is audited exactly once, not twice',
    actions.filter((a) => a === 'content.publish').length === 2 &&
      actions.filter((a) => a === 'content.approve').length === 2,
    actions.join(','),
  );
} finally {
  const ids = articleIds.filter(Boolean);
  if (ids.length) {
    await sql`DELETE FROM media_usage WHERE entity_type = 'article' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM content_versions WHERE entity_type = 'article' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM seo_meta WHERE entity_type = 'article' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM audit_log WHERE entity = 'article' AND entity_id = ANY(${ids.map(String)})`;
    await sql`DELETE FROM articles WHERE id = ANY(${ids})`;
  }
  await sql`DELETE FROM redirects WHERE from_path LIKE ${'/articles/%'} AND from_path LIKE ${`%${RUN}%`}`;
  if (tagIds.filter(Boolean).length) {
    await sql`DELETE FROM audit_log WHERE entity = 'tag' AND entity_id = ANY(${tagIds.filter(Boolean).map(String)})`;
    await sql`DELETE FROM tags WHERE id = ANY(${tagIds.filter(Boolean)})`;
  }
  if (categoryIds.filter(Boolean).length) {
    await sql`DELETE FROM audit_log WHERE entity = 'article_category' AND entity_id = ANY(${categoryIds.filter(Boolean).map(String)})`;
    await sql`DELETE FROM article_categories WHERE id = ANY(${categoryIds.filter(Boolean)})`;
  }
  if (assetIds.length) {
    await sql`DELETE FROM media_usage WHERE asset_id = ANY(${assetIds})`;
    await sql`DELETE FROM audit_log WHERE entity = 'media' AND entity_id = ANY(${assetIds.map(String)})`;
    await sql`DELETE FROM media_assets WHERE id = ANY(${assetIds})`;
  }
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
