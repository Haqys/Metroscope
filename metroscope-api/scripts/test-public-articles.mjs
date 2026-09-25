import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Public article surface, integration tests (doc 13 §10.6, doc 14 §2.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev                    # in one terminal
 *   npm run test:public-articles   # in another
 *
 * The property that matters most here is NEGATIVE: an article that is not
 * PUBLISHED must be unreachable by every public route, by slug, by search, by
 * category, by tag and as a related post. These pages are read by anyone on the
 * internet, and an article awaiting approval is routinely about a named child
 * and their competition result.
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

const TAG = 'pubart-test';
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
/** Nobody is signed in. This is the whole point of the suite. */
const P = api(null);

const doc = (text, mediaId) => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Latar Belakang' }] },
    { type: 'paragraph', content: [{ type: 'text', text }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hasil' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Medali emas.' }] },
    ...(mediaId ? [{ type: 'image', attrs: { mediaId, src: '/x.png', alt: 'gambar' } }] : []),
  ],
});

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const isIso = (v) => typeof v === 'string' && ISO_8601.test(v);

/** Every card must carry an ISO date too, the index renders `<time>` as well. */
const cardsIso = (items) => items.every((i) => isIso(i.publishedAt));

const accounts = [];
const articleIds = [];
const assetIds = [];
const categoryIds = [];
const tagIds = [];

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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Publik ${tag}`})`;
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

try {
  const head = await account('head', 'HEAD');
  const H = api(head.token);

  const [cover] = await sql`
    INSERT INTO media_assets (storage_key, mime_type, title, alt, status)
    VALUES (${`${TAG}-cover-${RUN}.png`}, 'image/png', 'Sampul', 'Tim juara', 'READY')
    RETURNING id`;
  assetIds.push(cover.id);

  const cat = await H('POST', '/site/categories', { name: `Prestasi ${RUN}` });
  const catSlug = cat.body.data.slug;
  categoryIds.push(cat.body.data.id);
  const catId = cat.body.data.id;

  const other = await H('POST', '/site/categories', { name: `Tips ${RUN}` });
  categoryIds.push(other.body?.data?.id);

  const tagA = await H('POST', '/site/tags', { name: `Olimpiade ${RUN}` });
  const tagB = await H('POST', '/site/tags', { name: `Matematika ${RUN}` });
  tagIds.push(tagA.body.data.id, tagB.body.data.id);

  /** Create, fill in, and walk the pipeline to PUBLISHED. */
  async function publish(title, patch = {}) {
    const created = await H('POST', '/site/articles', { title });
    const id = created.body.data.id;
    articleIds.push(id);
    await H('PATCH', `/site/content/article/${id}`, {
      excerpt: `Ringkasan untuk ${title}.`,
      body: doc(`Kisah lengkap ${title}.`),
      categoryId: catId,
      ...patch,
    });
    await H('POST', `/site/content/article/${id}/submit`, {});
    await H('POST', `/site/content/article/${id}/approve`, {});
    await H('POST', `/site/content/article/${id}/publish`, {});
    const [row] = await sql`SELECT slug FROM articles WHERE id = ${id}`;
    return { id, slug: row.slug };
  }

  const live = await publish(`Juara Umum OSN Bali ${RUN}`, {
    coverId: cover.id,
    tagIds: [tagA.body.data.id, tagB.body.data.id],
    subtitle: 'Delapan medali dari empat cabang',
  });
  const sibling = await publish(`Tips Latihan Olimpiade ${RUN}`, {
    tagIds: [tagA.body.data.id],
  });
  const unrelated = await publish(`Catatan Kegiatan Kelas ${RUN}`, {
    categoryId: other.body.data.id,
  });

  // A draft that must never be reachable from any public route.
  const draftRes = await H('POST', '/site/articles', { title: `Rahasia Belum Terbit ${RUN}` });
  const draft = draftRes.body.data;
  articleIds.push(draft.id);
  await H('PATCH', `/site/content/article/${draft.id}`, {
    excerpt: 'Rahasia yang belum boleh dibaca.',
    body: doc('Isi rahasia.'),
    categoryId: catId,
    tagIds: [tagA.body.data.id],
  });

  // An article awaiting review, likewise invisible.
  const reviewRes = await H('POST', '/site/articles', { title: `Menunggu Review ${RUN}` });
  const review = reviewRes.body.data;
  articleIds.push(review.id);
  await H('PATCH', `/site/content/article/${review.id}`, {
    excerpt: 'Sedang direview.',
    body: doc('Isi review.'),
    categoryId: catId,
  });
  await H('POST', `/site/content/article/${review.id}/submit`, {});

  // ═══ Nothing unpublished leaks ════════════════════════════════════
  console.log('\nUnpublished content is unreachable');

  const bySlug = await P('GET', `/public/articles/${draft.slug}`);
  check('a draft 404s by slug', bySlug.status === 404, String(bySlug.status));

  const reviewSlug = (await sql`SELECT slug FROM articles WHERE id = ${review.id}`)[0].slug;
  check(
    'an in-review article 404s by slug',
    (await P('GET', `/public/articles/${reviewSlug}`)).status === 404,
  );

  const all = await P('GET', '/public/articles?perPage=24');
  const slugs = all.body.data.items.map((i) => i.slug);
  check(
    'neither appears in the index',
    !slugs.includes(draft.slug) && !slugs.includes(reviewSlug),
    JSON.stringify(slugs),
  );

  const searched = await P('GET', `/public/articles?q=${encodeURIComponent('Rahasia')}`);
  check('nor in search', searched.body.data.items.length === 0, String(searched.body.data.total));

  const inCat = await P('GET', `/public/articles?category=${catSlug}`);
  check(
    'nor in its category hub',
    !inCat.body.data.items.some((i) => i.slug === draft.slug),
    JSON.stringify(inCat.body.data.items.map((i) => i.slug)),
  );

  const tagSlug = tagA.body.data.slug;
  const inTag = await P('GET', `/public/articles?tag=${tagSlug}`);
  check(
    'nor in its tag hub',
    !inTag.body.data.items.some((i) => i.slug === draft.slug),
    JSON.stringify(inTag.body.data.items.map((i) => i.slug)),
  );

  const detail = await P('GET', `/public/articles/${live.slug}`);
  check(
    'nor among related articles',
    !detail.body.data.related.some((r) => r.slug === draft.slug),
    JSON.stringify(detail.body.data.related.map((r) => r.slug)),
  );

  const taxo = await P('GET', '/public/taxonomy');
  const catRow = taxo.body.data.categories.find((c) => c.slug === catSlug);
  /** Four articles carry this category; two are published, two are not. */
  check(
    'the category count excludes drafts and in-review articles',
    catRow?.articleCount === 2,
    `${catRow?.articleCount} (expected 2 published of 4 in the category)`,
  );

  // ═══ The published article ════════════════════════════════════════
  console.log('\nThe published article');

  check('is readable anonymously', detail.status === 200, String(detail.status));
  check('carries its body AST', detail.body.data.body?.type === 'doc');
  check('and reading time', detail.body.data.readingMin >= 1);
  check(
    'resolves the cover to a public URL',
    typeof detail.body.data.coverUrl === 'string' &&
      detail.body.data.coverUrl.includes('/storage/v1/object/public/media/'),
    String(detail.body.data.coverUrl),
  );
  check('and the cover alt text', detail.body.data.coverAlt === 'Tim juara');
  check(
    'lists its tags',
    detail.body.data.tags.length === 2,
    JSON.stringify(detail.body.data.tags),
  );
  check('names its category', detail.body.data.categorySlug === catSlug);
  check('and its author', typeof detail.body.data.authorName === 'string');
  check('exposes publishedAt for the byline', detail.body.data.publishedAt !== null);
  /**
   * ISO 8601, not Postgres's own rendering.
   *
   * The driver returns `2026-08-07 03:42:40.653811+00`, which `new Date()`
   * happily parses, so every visible date looked correct while
   * `article:published_time`, `datePublished` in the JSON-LD and `<time
   * datetime>` all carried a value a crawler cannot read. Nothing on the page
   * changes when that field is dropped, which is why it needs asserting.
   */ check(
    'timestamps are ISO 8601, as OG and JSON-LD require',
    isIso(detail.body.data.publishedAt) && isIso(detail.body.data.updatedAt),
    JSON.stringify({ p: detail.body.data.publishedAt, u: detail.body.data.updatedAt }),
  );
  check(
    'including on list cards',
    cardsIso(all.body.data.items),
    JSON.stringify(all.body.data.items.map((i) => i.publishedAt)),
  );

  /**
   * The public payload must not carry the editorial fields. A leak here is not
   * a 500, the page renders perfectly and the extra data sits in the HTML.
   */
  const leaked = ['reviewNote', 'authorId', 'reviewedById', 'status', 'version'].filter(
    (k) => detail.body.data[k] !== undefined,
  );
  check('carries no editorial fields', leaked.length === 0, leaked.join(','));

  const cards = all.body.data.items;
  check(
    'list cards omit the body AST',
    cards.every((c) => c.body === undefined),
    'a listing would otherwise ship one document per card',
  );

  // ═══ Filters, search, pagination ══════════════════════════════════
  console.log('\nFilters, search and pagination');

  check(
    'category filter narrows to that category',
    inCat.body.data.items.length >= 1 &&
      inCat.body.data.items.every((i) => i.categorySlug === catSlug),
    JSON.stringify(inCat.body.data.items.map((i) => i.categorySlug)),
  );
  check(
    'tag filter narrows to that tag',
    inTag.body.data.items.length === 2 &&
      inTag.body.data.items.every((i) => i.tags.some((t) => t.slug === tagSlug)),
    JSON.stringify(inTag.body.data.items.map((i) => i.slug)),
  );

  const found = await P('GET', `/public/articles?q=${encodeURIComponent('Juara Umum')}`);
  check(
    'search finds the article by title',
    found.body.data.items.some((i) => i.slug === live.slug),
    JSON.stringify(found.body.data.items.map((i) => i.title)),
  );

  const paged = await P('GET', `/public/articles?category=${catSlug}&perPage=1`);
  check(
    'pagination reports a page count, not just a slice',
    paged.body.data.items.length === 1 &&
      paged.body.data.perPage === 1 &&
      paged.body.data.page === 1,
    JSON.stringify({ n: paged.body.data.items.length, ...paged.body.data }),
  );

  const page2 = await P('GET', '/public/articles?perPage=1&page=2');
  check(
    'page 2 returns different rows to page 1',
    page2.body.data.items[0]?.slug !==
      (await P('GET', '/public/articles?perPage=1')).body.data.items[0]?.slug,
  );

  const huge = await P('GET', '/public/articles?perPage=100000');
  check('perPage is capped', huge.status === 422, String(huge.status));

  const hostile = await P(
    'GET',
    `/public/articles?q=${encodeURIComponent("x'; DROP TABLE articles;--")}`,
  );
  check(
    'a hostile search string is just a search string',
    hostile.status === 200 &&
      (await sql`SELECT to_regclass('public.articles') AS t`)[0].t === 'articles',
  );

  // ═══ Related articles (doc 13 §10.9) ══════════════════════════════
  console.log('\nRelated articles');

  const related = detail.body.data.related;
  check('at most three are returned', related.length <= 3, String(related.length));
  check('the article never relates to itself', !related.some((r) => r.slug === live.slug));
  check(
    'same category + shared tag outranks a different category',
    related[0]?.slug === sibling.slug,
    JSON.stringify(related.map((r) => r.slug)),
  );
  check(
    'an article sharing nothing scores zero and is excluded',
    !related.some((r) => r.slug === unrelated.slug),
    JSON.stringify(related.map((r) => r.slug)),
  );

  // ═══ SEO ══════════════════════════════════════════════════════════
  console.log('\nSEO overrides');

  check(
    'seo fields are present (null until an editor sets them)',
    'seoTitle' in detail.body.data && 'seoNoindex' in detail.body.data,
    JSON.stringify(Object.keys(detail.body.data).filter((k) => k.startsWith('seo'))),
  );

  await H('PUT', `/site/content/article/${live.id}/seo`, {
    title: 'Judul SEO Khusus',
    description: 'Deskripsi yang ditulis editor.',
    noindex: true,
  });
  const withSeo = await P('GET', `/public/articles/${live.slug}`);
  check(
    'an editor override reaches the public payload',
    withSeo.body.data.seoTitle === 'Judul SEO Khusus' &&
      withSeo.body.data.seoDescription === 'Deskripsi yang ditulis editor.',
    JSON.stringify({ t: withSeo.body.data.seoTitle, d: withSeo.body.data.seoDescription }),
  );
  check('including noindex', withSeo.body.data.seoNoindex === true);

  // ═══ Redirects (doc 13 §10.8) ═════════════════════════════════════
  console.log('\nSlug changes and 301s');

  const oldSlug = live.slug;
  const newSlug = `juara-umum-osn-bali-baru-${RUN}`;
  /**
   * Renaming a live URL means taking it down first.
   *
   * `updateDraft` edits DRAFT only, so the route to a new slug is unpublish →
   * rename → republish. That is the pipeline working as designed: the reviewer's
   * approval must mean the thing they read, and a URL is part of that. The 301
   * is still written from the OLD address, which is what matters here.
   */
  const blocked = await H('PATCH', `/site/content/article/${live.id}`, { slug: newSlug });
  check(
    'a live article cannot be renamed in place',
    blocked.status === 409 && blocked.body?.error?.code === 'NOT_EDITABLE',
    JSON.stringify(blocked.body),
  );

  await H('POST', `/site/content/article/${live.id}/unpublish`, {});
  const renamed = await H('PATCH', `/site/content/article/${live.id}`, { slug: newSlug });
  check(
    'a publisher renames it once withdrawn',
    renamed.status === 200,
    JSON.stringify(renamed.body),
  );
  await H('POST', `/site/content/article/${live.id}/submit`, {});
  await H('POST', `/site/content/article/${live.id}/approve`, {});
  await H('POST', `/site/content/article/${live.id}/publish`, {});

  const redirect = await P(
    'GET',
    `/public/redirects?path=${encodeURIComponent(`/articles/${oldSlug}`)}`,
  );
  check(
    'the 301 is written against /articles/, not /artikel/',
    redirect.body.data?.toPath === `/articles/${newSlug}` && redirect.body.data?.statusCode === 301,
    JSON.stringify(redirect.body.data),
  );

  check(
    'the old slug now 404s, so the page falls through to the redirect',
    (await P('GET', `/public/articles/${oldSlug}`)).status === 404,
  );
  check(
    'the new slug serves the article',
    (await P('GET', `/public/articles/${newSlug}`)).status === 200,
  );
  check(
    'an unknown path resolves to null, not 404',
    (await P('GET', '/public/redirects?path=%2Farticles%2Fnever-existed')).status === 200 &&
      (await P('GET', '/public/redirects?path=%2Farticles%2Fnever-existed')).body.data === null,
  );

  // ═══ Unpublishing removes it from the web ═════════════════════════
  console.log('\nUnpublishing');

  await H('POST', `/site/content/article/${live.id}/unpublish`, {});
  check(
    'an unpublished article disappears from the public API',
    (await P('GET', `/public/articles/${newSlug}`)).status === 404,
  );
  const afterUnpublish = await P('GET', '/public/articles?perPage=24');
  check('and from every listing', !afterUnpublish.body.data.items.some((i) => i.slug === newSlug));

  // ═══ Input handling ═══════════════════════════════════════════════
  console.log('\nInput handling');

  check(
    'a path-traversal slug is a 404, not a 500',
    (await P('GET', '/public/articles/..%2F..%2Fetc%2Fpasswd')).status === 404,
  );
  check(
    'an uppercase slug is refused before it reaches Postgres',
    (await P('GET', '/public/articles/Juara-Umum')).status === 404,
  );
  check('taxonomy is anonymous-readable', (await P('GET', '/public/taxonomy')).status === 200);
  check(
    'tags with no published article are dropped from taxonomy',
    (await P('GET', '/public/taxonomy')).body.data.tags.every((t) => t.articleCount > 0),
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
  await sql`DELETE FROM redirects WHERE from_path LIKE ${`%${RUN}%`} OR to_path LIKE ${`%${RUN}%`}`;
  const tids = tagIds.filter(Boolean);
  if (tids.length) {
    await sql`DELETE FROM audit_log WHERE entity = 'tag' AND entity_id = ANY(${tids.map(String)})`;
    await sql`DELETE FROM tags WHERE id = ANY(${tids})`;
  }
  const cids = categoryIds.filter(Boolean);
  if (cids.length) {
    await sql`DELETE FROM audit_log WHERE entity = 'article_category' AND entity_id = ANY(${cids.map(String)})`;
    await sql`DELETE FROM article_categories WHERE id = ANY(${cids})`;
  }
  if (assetIds.length) {
    await sql`DELETE FROM media_usage WHERE asset_id = ANY(${assetIds})`;
    await sql`DELETE FROM audit_log WHERE entity = 'media' AND entity_id = ANY(${assetIds.map(String)})`;
    await sql`DELETE FROM media_assets WHERE id = ANY(${assetIds})`;
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
