import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HTTP status semantics of the public site (doc 14 §2.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES THE LANDING APP RUNNING on :3004, dev or `next start`, both are
 * asserted the same way.
 *
 *   npm run dev            # in metroscope-landing
 *   npm run test:status    # here
 *
 * This suite exists because a page can render perfectly and still be wrong.
 * Every assertion below is about the STATUS LINE and the `Location` header,
 * the parts only a crawler reads, and the parts that were silently broken:
 *
 *   · a root `app/loading.tsx` wrapped every route in Suspense, so Next
 *     streamed the fallback first and committed **200 OK** before the page had
 *     decided anything;
 *   · a missing article then rendered "Halaman tidak ditemukan" with a 200, a
 *     soft 404, which search engines index as a real page; and
 *   · a renamed article's 301 resolved correctly, was logged, and still came
 *     back 200 with no `Location`, so the ranking went nowhere.
 *
 * Nothing looked broken in a browser. `test:public-articles` covers what the
 * API returns; this covers what the WEB SERVER returns, which is a different
 * claim and the one that was false.
 *
 * Fixtures are written straight to Postgres. The editorial pipeline is already
 * asserted elsewhere and is not what is under test here, the subject is how
 * the site answers an HTTP request for a URL in each of four states.
 */
loadEnvLocal();

const SITE = process.env.SITE_TEST_URL ?? 'http://localhost:3004';
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const RUN = Date.now();
const LIVE = `status-live-${RUN}`;
const MOVED = `status-moved-${RUN}`;
const GONE = `status-gone-${RUN}`;

let pass = 0,
  fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? `, ${d}` : ''}`);
};

/** Never follow: the redirect itself is the thing being asserted. */
async function head(path) {
  const res = await fetch(`${SITE}${path}`, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') };
}

const ids = [];

try {
  const body = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi uji status.' }] }],
  });

  for (const slug of [LIVE, MOVED]) {
    const [row] = await sql`
      INSERT INTO articles (title, slug, excerpt, body, status, published_at, version, reading_min)
      VALUES (${`Uji ${slug}`}, ${slug}, 'Ringkasan uji.', ${body}::jsonb,
              'PUBLISHED', now(), 1, 1)
      RETURNING id`;
    ids.push(row.id);
  }

  // The moved article is then renamed, exactly as a rename leaves the world:
  // the new slug is live and a 301 points at it from the old one.
  const NEW = `${MOVED}-baru`;
  await sql`UPDATE articles SET slug = ${NEW} WHERE slug = ${MOVED}`;
  await sql`
    INSERT INTO redirects (from_path, to_path, status_code, reason)
    VALUES (${`/articles/${MOVED}`}, ${`/articles/${NEW}`}, 301, 'status test')`;

  console.log('\nArticle detail');

  const live = await head(`/articles/${LIVE}`);
  check('a published article is 200', live.status === 200, String(live.status));

  const gone = await head(`/articles/${GONE}`);
  check(
    'a slug that never existed is a real 404, not a soft one',
    gone.status === 404,
    `${gone.status}, a 200 here is indexed as a real page`,
  );

  const moved = await head(`/articles/${MOVED}`);
  check(
    'a renamed article redirects permanently',
    moved.status === 301 || moved.status === 308,
    `${moved.status}, the 301 is in the table; the response must carry it`,
  );
  check(
    'and sends a Location header',
    moved.location === `/articles/${NEW}`,
    String(moved.location),
  );

  const target = await head(`/articles/${NEW}`);
  check('whose target serves the article', target.status === 200, String(target.status));

  console.log('\nHubs');

  check(
    'an unknown category is a real 404',
    (await head('/articles/kategori/tidak-pernah-ada')).status === 404,
  );
  check(
    'an unknown tag is a real 404',
    (await head('/articles/tag/tidak-pernah-ada')).status === 404,
  );
  check('the article index is 200', (await head('/articles')).status === 200);

  console.log('\nRetired paths (doc 02 §1.4)');

  const porto = await head('/porto');
  check(
    '/porto redirects permanently',
    porto.status === 301 || porto.status === 308,
    String(porto.status),
  );
  check('to /articles', porto.location === '/articles', String(porto.location));

  const portoSlug = await head('/porto/juara-1-osn-matematika-aditya');
  check(
    '/porto/:slug redirects permanently',
    portoSlug.status === 301 || portoSlug.status === 308,
    String(portoSlug.status),
  );

  console.log('\nOther surfaces that set a status');

  check(
    'an unknown programme is a real 404',
    (await head('/programs/tidak-pernah-ada')).status === 404,
    'this route had the same soft-404 and predates Phase 2',
  );
  check('an unmatched URL is a real 404', (await head('/betul-betul-tidak-ada')).status === 404);
} finally {
  if (ids.length) await sql`DELETE FROM articles WHERE id = ANY(${ids})`;
  await sql`DELETE FROM redirects WHERE reason = 'status test'`;
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
