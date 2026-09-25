import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SEO plumbing, sitemap, robots, RSS and structured data (doc 14 §2.8).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES BOTH THE API (:3000) AND THE LANDING APP (:3004) RUNNING.
 *
 *   npm run dev          # in metroscope-api
 *   npm run dev          # in metroscope-landing
 *   npm run test:seo     # here
 *
 * Everything asserted here is invisible in a browser. A sitemap listing a draft
 * looks exactly like one that does not; a feed with an unescaped ampersand
 * renders as an empty subscription; JSON-LD that disagrees with the page is a
 * manual-action email six weeks later. `test:status` covers what the server
 * ANSWERS; this covers what it SAYS to machines.
 *
 * The negative assertions are the ones that matter. A sitemap is a list of URLs
 * handed to a crawler with an invitation to fetch each one, a draft leaking
 * into it is not a cosmetic bug, it is unpublished copy about a named child
 * being actively recommended to Google.
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const SITE = process.env.SITE_TEST_URL ?? 'http://localhost:3004';

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

const TAG = 'seo-test';
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
const P = api(null);

const text = async (path) => {
  const r = await fetch(`${SITE}${path}`, { redirect: 'manual' });
  return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
};

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Purge the site's tag cache, the way the API does after a publish.
 *
 * The fixtures below are written straight to Postgres, the pipeline is
 * asserted in `test:cms` and is not what is under test here, so nothing tells
 * the site they exist. Without this, `/faq` and `/testimonials` serve a list
 * cached before the run started and the assertions are about somebody else's
 * data. The purge PATH gets its own section at the end, where it is the subject
 * rather than the setup.
 */
const purge = (tags) =>
  fetch(`${SITE}/api/revalidate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-revalidate-secret': required('REVALIDATE_SECRET'),
    },
    body: JSON.stringify({ tags }),
  });

const doc = (t) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

const LIVE = `${TAG}-live-${RUN}`;
const DRAFT = `${TAG}-draft-${RUN}`;
const HIDDEN = `${TAG}-hidden-${RUN}`;
const AMP = `${TAG}-amp-${RUN}`;
const PAGE = `${TAG}-page-${RUN}`;
const MENTOR = `${TAG}-mentor-${RUN}`;
const LATER = `${TAG}-later-${RUN}`;

const accounts = [];
const articleIds = [];
const pageIds = [];
const mentorIds = [];
const faqIds = [];
const testimonialIds = [];
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`SEO ${tag}`})`;
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

async function insertArticle(slug, title, status, extra = {}) {
  const [row] = await sql`
    INSERT INTO articles (title, slug, excerpt, body, status, published_at, version, reading_min,
                          category_id)
    VALUES (${title}, ${slug}, ${`Ringkasan ${slug}.`}, ${JSON.stringify(doc('Isi uji SEO.'))}::jsonb,
            ${status}, ${status === 'PUBLISHED' ? new Date() : null}, ${status === 'PUBLISHED' ? 1 : 0},
            2, ${extra.categoryId ?? null})
    RETURNING id`;
  articleIds.push(row.id);
  return row.id;
}

try {
  const head = await account('head', 'HEAD');
  const H = api(head.token);

  // ── fixtures ─────────────────────────────────────────────────────────
  const [category] = await sql`
    INSERT INTO article_categories (slug, name, description, order_index)
    VALUES (${`${TAG}-kat-${RUN}`}, ${`Kategori SEO ${RUN}`}, 'Untuk uji sitemap.', 900)
    RETURNING id, slug`;
  categoryIds.push(category.id);

  const [tagRow] = await sql`
    INSERT INTO tags (slug, name) VALUES (${`${TAG}-tag-${RUN}`}, ${`Tag SEO ${RUN}`})
    RETURNING id, slug`;
  tagIds.push(tagRow.id);

  const liveId = await insertArticle(LIVE, `Juara OSN ${RUN}`, 'PUBLISHED', {
    categoryId: category.id,
  });
  await sql`INSERT INTO article_tags (article_id, tag_id) VALUES (${liveId}, ${tagRow.id})`;

  await insertArticle(DRAFT, `Draf rahasia ${RUN}`, 'DRAFT');

  const hiddenId = await insertArticle(HIDDEN, `Musiman ${RUN}`, 'PUBLISHED');
  await sql`
    INSERT INTO seo_meta (entity_type, entity_id, noindex) VALUES ('article', ${hiddenId}, true)`;

  /** An ampersand in a title is enough to make an unescaped feed unparseable. */
  await insertArticle(AMP, `Debat & Public Speaking ${RUN}`, 'PUBLISHED');

  const [page] = await sql`
    INSERT INTO pages (slug, title, description, status, published_at, version)
    VALUES (${PAGE}, ${`Halaman SEO ${RUN}`}, 'Uji sitemap.', 'PUBLISHED', now(), 1)
    RETURNING id`;
  pageIds.push(page.id);

  const mentorAccount = await account('mentor', 'MENTOR');
  const [mentor] = await sql`
    INSERT INTO mentor_profiles (user_id, slug, display_name, headline, status, published_at, version)
    VALUES (${mentorAccount.id}, ${MENTOR}, ${`Kak SEO ${RUN}`}, 'Mentor uji', 'PUBLISHED', now(), 1)
    RETURNING id`;
  mentorIds.push(mentor.id);

  const [faq] = await sql`
    INSERT INTO faq_entries (question, answer, category, order_index, status, published_at, version)
    VALUES (${`Berapa biaya per bulan ${RUN}?`}, 'Tergantung program yang dipilih.', 'Biaya', 1,
            'PUBLISHED', now(), 1)
    RETURNING id`;
  faqIds.push(faq.id);

  const [testimonial] = await sql`
    INSERT INTO testimonials (quote, author_name, author_role, consent_source, consent_at,
                              status, published_at, version)
    VALUES (${`Anak saya lebih percaya diri ${RUN}.`}, ${`Bunda SEO ${RUN}`}, 'Orang tua',
            'WA 12 Mei', now(), 'PUBLISHED', now(), 1)
    RETURNING id`;
  testimonialIds.push(testimonial.id);

  await purge(['articles', 'pages', 'mentors', 'faq', 'testimonials', 'sitemap']);

  // ═══ the API's answer ════════════════════════════════════════════════
  console.log('\nGET /v1/public/sitemap');

  const res = await P('GET', '/public/sitemap');
  check('the sitemap endpoint is anonymous-readable', res.status === 200, String(res.status));

  const items = res.body?.data?.items ?? [];
  const paths = items.map((i) => i.path);
  const at = (p) => items.find((i) => i.path === p);

  check('a published article is listed', paths.includes(`/articles/${LIVE}`));
  check(
    'a DRAFT article is not. RLS, not a predicate written here',
    !paths.includes(`/articles/${DRAFT}`),
    `saw ${paths.filter((p) => p.includes(DRAFT)).join(',')}`,
  );
  check(
    'a published but noindex article is not listed',
    !paths.includes(`/articles/${HIDDEN}`),
    'an editor who says "keep this out of search" must not be contradicted by the sitemap',
  );

  check('a published page is listed at its own slug', paths.includes(`/${PAGE}`));
  check('a published mentor profile is listed', paths.includes(`/mentors/${MENTOR}`));
  check(
    'the category hub is listed',
    paths.includes(`/articles/kategori/${category.slug}`),
    'doc 13 §10.6 calls these indexable hub pages',
  );
  check('the tag hub is listed', paths.includes(`/articles/tag/${tagRow.slug}`));

  /**
   * FAQ entries and testimonials declare `publicPath: null`. The registry
   * already knows they have no URL of their own, the sitemap must not invent
   * one, and must not skip them by a hardcoded list of types either.
   */
  check(
    'types with no public URL contribute nothing',
    !paths.some((p) => p.includes('faq/') || p.includes('testimonial')),
    paths.filter((p) => p.includes('faq') || p.includes('testimonial')).join(','),
  );

  check(
    'every path is site-relative',
    paths.every((p) => p.startsWith('/')),
    paths.filter((p) => !p.startsWith('/')).join(','),
  );
  check('there are no duplicate paths', new Set(paths).size === paths.length);
  check(
    'lastModified is ISO 8601, not Postgres rendering',
    items.every((i) => i.lastModified === null || ISO_8601.test(i.lastModified)),
    JSON.stringify(items.find((i) => i.lastModified && !ISO_8601.test(i.lastModified))),
  );
  check(
    'the payload carries paths and dates only',
    items.every((i) => Object.keys(i).sort().join(',') === 'lastModified,path,type'),
    JSON.stringify(Object.keys(items[0] ?? {})),
  );

  /** Unpublishing must retract the invitation, not just hide the page. */
  await sql`UPDATE articles SET status = 'DRAFT' WHERE slug = ${AMP}`;
  check(
    'unpublishing removes the URL',
    !(await P('GET', '/public/sitemap')).body.data.items.some((i) => i.path === `/articles/${AMP}`),
  );
  await sql`UPDATE articles SET status = 'PUBLISHED' WHERE slug = ${AMP}`;

  // ═══ /sitemap.xml ════════════════════════════════════════════════════
  console.log('\n/sitemap.xml');

  const map = await text('/sitemap.xml');
  check('is 200', map.status === 200, String(map.status));
  check('is XML', map.type.includes('xml'), map.type);
  check('declares the sitemap namespace', map.body.includes('sitemaps.org/schemas/sitemap'));
  check('lists the home page absolutely', map.body.includes(`<loc>${SITE}</loc>`));
  check('lists the static marketing routes', map.body.includes(`<loc>${SITE}/programs</loc>`));
  check('lists the published article', map.body.includes(`/articles/${LIVE}`));
  check('does NOT list the draft', !map.body.includes(DRAFT));
  check('does NOT list the noindex article', !map.body.includes(HIDDEN));
  check(
    'does NOT list /login',
    !map.body.includes(`<loc>${SITE}/login</loc>`),
    'it is noindex; a sitemap entry would say the opposite',
  );
  check('does NOT list /preview', !map.body.includes('/preview'));
  check(
    'static routes carry no invented lastmod',
    !/<url>\s*<loc>[^<]*\/programs<\/loc>\s*<lastmod>/.test(map.body),
  );

  // ═══ /robots.txt ═════════════════════════════════════════════════════
  console.log('\n/robots.txt');

  const robots = await text('/robots.txt');
  check(
    'is 200 and comes from app/robots.ts',
    robots.status === 200,
    'a static public/robots.txt shadows the route and 500s the whole path',
  );
  check('is plain text', robots.type.includes('text/plain'), robots.type);
  check('allows the site', /Allow:\s*\/$/m.test(robots.body), robots.body);
  check('disallows /preview', /Disallow:\s*\/preview/.test(robots.body));
  check('disallows /api/', /Disallow:\s*\/api\//.test(robots.body));
  check(
    'points at the sitemap absolutely',
    robots.body.includes(`Sitemap: ${SITE}/sitemap.xml`),
    robots.body,
  );

  // ═══ /rss.xml ════════════════════════════════════════════════════════
  console.log('\n/rss.xml');

  const rss = await text('/rss.xml');
  check('is 200', rss.status === 200, String(rss.status));
  check('is served as RSS', rss.type.includes('application/rss+xml'), rss.type);
  check('declares the atom self link', rss.body.includes(`href="${SITE}/rss.xml"`));
  check('carries the published article', rss.body.includes(`Juara OSN ${RUN}`));
  check('does NOT carry the draft', !rss.body.includes(DRAFT));
  check(
    'escapes an ampersand in a title',
    rss.body.includes(`Debat &amp; Public Speaking ${RUN}`) &&
      !rss.body.includes(`Debat & Public Speaking ${RUN}`),
    'an unescaped & makes the whole document unparseable, so the reader shows nothing',
  );
  check(
    'guids are the canonical article URLs',
    rss.body.includes(`<guid isPermaLink="true">${SITE}/articles/${LIVE}</guid>`),
  );

  const pubDate = rss.body.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
  check(
    'pubDate is a date a reader can parse',
    Boolean(pubDate) && !Number.isNaN(new Date(pubDate).getTime()),
    String(pubDate),
  );

  // ═══ structured data ═════════════════════════════════════════════════
  console.log('\nJSON-LD');

  const home = await text('/');
  check(
    'the home page carries Organization, once',
    (home.body.match(/EducationalOrganization/g) ?? []).length >= 1,
  );
  check(
    'with a postal address',
    home.body.includes('PostalAddress') && home.body.includes('Denpasar'),
  );
  check(
    'and NO aggregateRating. Nobody has collected one',
    !home.body.includes('aggregateRating'),
    'the "4.8/5" on the page is a literal in the source; asserting it to Google would be a claim',
  );

  const faqPage = await text('/faq');
  check('/faq emits FAQPage', faqPage.body.includes('"@type":"FAQPage"'));
  check(
    'with the question that is on the page',
    faqPage.body.includes(`Berapa biaya per bulan ${RUN}?`),
  );
  check('and a breadcrumb trail', faqPage.body.includes('"@type":"BreadcrumbList"'));

  const testiPage = await text('/testimonials');
  check('/testimonials emits Review', testiPage.body.includes('"@type":"Review"'));
  check(
    'without inventing a rating',
    !testiPage.body.includes('reviewRating') && !testiPage.body.includes('ratingValue'),
    'testimonials have no rating column; a 5 here would be fabricated',
  );
  check(
    'and never the consent record',
    !testiPage.body.includes('WA 12 Mei'),
    'consent must EXIST, not be broadcast',
  );

  const articlePage = await text(`/articles/${LIVE}`);
  check('an article emits Article', articlePage.body.includes('"@type":"Article"'));
  check('and BreadcrumbList', articlePage.body.includes('"@type":"BreadcrumbList"'));
  check(
    'with the category in the trail',
    articlePage.body.includes(`/articles/kategori/${category.slug}`),
  );
  check(
    'the publisher references the Organization node by id',
    articlePage.body.includes('#organization'),
  );

  const mentorPage = await text(`/mentors/${MENTOR}`);
  check('a mentor page emits BreadcrumbList', mentorPage.body.includes('"@type":"BreadcrumbList"'));
  check(
    'and no Person node that could name the account',
    !mentorPage.body.includes('"@type":"Person"'),
    'mentor_profiles exists so a public page never reaches users',
  );

  // ═══ metadata ════════════════════════════════════════════════════════
  console.log('\nHead metadata');

  check(
    'the home page canonical matches its sitemap <loc> exactly',
    home.body.includes(`rel="canonical" href="${SITE}"`) &&
      (await text('/sitemap.xml')).body.includes(`<loc>${SITE}</loc>`),
    'Next strips an empty pathname, so the sitemap must spell the root the same way',
  );
  check('and og:site_name', home.body.includes('og:site_name'), 'WhatsApp prints it above a link');
  check('and og:locale', home.body.includes('id_ID'));
  check(
    'the article page keeps its article: metadata',
    articlePage.body.includes('article:published_time'),
  );
  check(
    'and og:site_name too, the helper did not replace a working tag with a missing one',
    articlePage.body.includes('og:site_name'),
  );

  const login = await text('/login');
  check('/login is noindex', /content="noindex/.test(login.body), 'it competes with /register');
  check('/login still 200s', login.status === 200, String(login.status));

  const feedLink = await text('/articles');
  check(
    'every marketing page advertises the feed',
    feedLink.body.includes('application/rss+xml') && feedLink.body.includes('/rss.xml'),
    'the root layout metadata would have been replaced by this page own alternates',
  );

  // ═══ purge on publish ════════════════════════════════════════════════
  console.log('\nISR purge');

  /**
   * The end-to-end claim: publishing through the pipeline puts a URL in
   * `sitemap.xml` without a deploy and without waiting out the 300s backstop.
   * That requires the API to emit the `sitemap` tag, the landing to accept it,
   * and the cached fetch to be tagged with it, three things that each look
   * fine alone while the chain is broken.
   */
  const [later] = await sql`
    INSERT INTO articles (title, slug, excerpt, body, status, version, reading_min)
    VALUES (${`Terbit belakangan ${RUN}`}, ${LATER}, 'Ringkasan.',
            ${JSON.stringify(doc('Isi.'))}::jsonb, 'APPROVED', 0, 2)
    RETURNING id`;
  articleIds.push(later.id);

  check(
    'before publishing, the URL is absent from the live sitemap',
    !(await text('/sitemap.xml')).body.includes(LATER),
  );

  const published = await H('POST', `/site/content/article/${later.id}/publish`, {});
  check('publishing succeeds', published.status === 200, JSON.stringify(published.body));

  await new Promise((r) => setTimeout(r, 1500));
  check(
    'and the sitemap already lists it, the `sitemap` tag was purged',
    (await text('/sitemap.xml')).body.includes(LATER),
    'not the 300s backstop: this is under two seconds',
  );
  check(
    'the feed picked it up as well',
    (await text('/rss.xml')).body.includes(`Terbit belakangan ${RUN}`),
  );

  // ═══ the SEO panel's writes ══════════════════════════════════════════
  console.log('\nSEO overrides');

  const seoRead = await H('GET', `/site/content/article/${liveId}/seo`);
  check('the SEO record reads back', seoRead.status === 200, JSON.stringify(seoRead.body));
  check(
    'as an all-null record rather than null, before anything is set',
    seoRead.body?.data?.title === null && seoRead.body?.data?.noindex === false,
    JSON.stringify(seoRead.body?.data),
  );
  check(
    'carrying the public path from the registry, not assembled by the editor',
    seoRead.body?.data?.publicPath === `/articles/${LIVE}`,
    String(seoRead.body?.data?.publicPath),
  );

  const OVERRIDE = `Judul SEO khusus ${RUN}`;
  const saved = await H('PUT', `/site/content/article/${liveId}/seo`, {
    title: OVERRIDE,
    description: 'Deskripsi yang ditulis editor, bukan diturunkan.',
    noindex: false,
  });
  check('an override saves', saved.status === 200, JSON.stringify(saved.body));

  await new Promise((r) => setTimeout(r, 1500));
  check(
    'and the live page shows it without waiting out the cache',
    (await text(`/articles/${LIVE}`)).body.includes(OVERRIDE),
    'saving seo_meta must purge the same tags a publish does',
  );

  /** The flag the sitemap honours must take effect the moment it is set. */
  await H('PUT', `/site/content/article/${liveId}/seo`, { title: OVERRIDE, noindex: true });
  await new Promise((r) => setTimeout(r, 1500));
  check(
    'turning on noindex drops the URL from the live sitemap',
    !(await text('/sitemap.xml')).body.includes(`/articles/${LIVE}`),
  );
  check(
    'and the page says so itself',
    /content="noindex/.test((await text(`/articles/${LIVE}`)).body),
    'the sitemap and the page must not disagree about the same URL',
  );

  const mentorSeo = await H('GET', `/site/content/faq/${faq.id}/seo`);
  check(
    'a type with no public URL reports none',
    mentorSeo.body?.data?.publicPath === null,
    String(mentorSeo.body?.data?.publicPath),
  );
} finally {
  const ids = articleIds.filter(Boolean);
  if (ids.length) {
    await sql`DELETE FROM article_tags WHERE article_id = ANY(${ids})`;
    await sql`DELETE FROM media_usage WHERE entity_type = 'article' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM content_versions WHERE entity_type = 'article' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM seo_meta WHERE entity_type = 'article' AND entity_id = ANY(${ids})`;
    await sql`DELETE FROM audit_log WHERE entity = 'article' AND entity_id = ANY(${ids.map(String)})`;
    await sql`DELETE FROM articles WHERE id = ANY(${ids})`;
  }
  if (pageIds.length) {
    await sql`DELETE FROM page_blocks WHERE page_id = ANY(${pageIds})`;
    await sql`DELETE FROM content_versions WHERE entity_type = 'page' AND entity_id = ANY(${pageIds})`;
    await sql`DELETE FROM pages WHERE id = ANY(${pageIds})`;
  }
  if (mentorIds.length) {
    await sql`DELETE FROM content_versions WHERE entity_type = 'mentor' AND entity_id = ANY(${mentorIds})`;
    await sql`DELETE FROM mentor_profiles WHERE id = ANY(${mentorIds})`;
  }
  if (faqIds.length) await sql`DELETE FROM faq_entries WHERE id = ANY(${faqIds})`;
  if (testimonialIds.length) await sql`DELETE FROM testimonials WHERE id = ANY(${testimonialIds})`;
  if (tagIds.length) await sql`DELETE FROM tags WHERE id = ANY(${tagIds})`;
  if (categoryIds.length) await sql`DELETE FROM article_categories WHERE id = ANY(${categoryIds})`;

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
