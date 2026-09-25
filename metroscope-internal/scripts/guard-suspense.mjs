import fs from 'node:fs';
import path from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A Suspense boundary above a page that sets an HTTP status is a soft 404.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `loading.tsx` wraps its whole subtree in `<Suspense>`. Next then STREAMS the
 * response: the fallback is flushed as the first chunk, and the HTTP status
 * line and headers go out with it. A `notFound()` or `redirect()` that resolves
 * afterwards can only swap the streamed markup. It cannot retract a status
 * that has already been sent, or add a `Location` header.
 *
 * That is exactly what happened. A root `app/loading.tsx` sat above every
 * route, so:
 *
 *   · a missing article rendered "Halaman tidak ditemukan" with **200 OK**:
 *     a soft 404, which search engines index as a real page; and
 *   · a renamed article's 301 resolved correctly, was logged, and still came
 *     back **200 with no Location**, so the ranking went nowhere.
 *
 * Neither failed loudly. The page looked right in a browser, and only the
 * status line was wrong, which is why this guard exists rather than a comment.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  WHAT THIS FORBIDS, and, more importantly, what it does not
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The rule is narrow: **a page may not have a Suspense boundary ABOVE the point
 * where it decides its status.** Streaming itself is fine, and this guard is not
 * a ban on loading UI.
 *
 * The check: for every `page.tsx` that calls `notFound()`, `redirect()` or
 * `permanentRedirect()`, no ancestor segment, its own included, up to `app/`,
 * may declare a `loading.tsx`, and no ancestor `layout.tsx` may wrap children in
 * `<Suspense>`.
 *
 * FORBIDDEN, because each streams before the page has decided:
 *
 *   app/loading.tsx                        (the original defect: above everything)
 *   app/(site)/loading.tsx                 route groups are real directories
 *   app/(site)/articles/loading.tsx        wraps the [slug] child too
 *   app/(site)/articles/[slug]/loading.tsx a segment's own loading wraps its page
 *
 * ALLOWED, and genuinely useful:
 *
 *   app/(site)/register/loading.tsx        a leaf that never sets a status
 *   app/(site)/testimonials/loading.tsx    likewise
 *   <Suspense> INSIDE a page, below the notFound()/redirect() call
 *
 * That last one is the escape hatch worth knowing, and it is verified: a page
 * that calls `notFound()` first and THEN renders `<Suspense>` around a slow
 * child returns a real 404 for the missing case and, for the valid case, a 200
 * whose body contains the fallback followed by the late content. I.e. it
 * streams, exactly as intended. Decide the status, then stream everything else.
 *
 * A sibling's `loading.tsx` never affects another route. Only ancestors matter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  KNOWN BLIND SPOT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The status call is detected by reading the `page.tsx` source. A page that
 * delegates to a helper in ANOTHER file,
 *
 *     import { bail } from './helper';   // helper calls notFound()
 *     if (!article) bail();
 *,
 * is invisible here, and a `loading.tsx` above it will pass. Verified, not
 * assumed. Following imports would mean building a module graph for a check
 * that runs on every commit, so the trade is deliberate: keep the
 * `notFound()`/`redirect()` call in the `page.tsx` itself. If a page must
 * delegate, note it there, and cover the route in `npm run test:status`, which
 * asserts the status line over HTTP and cannot be fooled by where the call
 * lives.
 */
const APP = path.join(process.cwd(), 'app');
const STATUS_CALL = /\b(notFound|permanentRedirect|redirect)\s*\(/;
const failures = [];

function pagesThatSetStatus(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pagesThatSetStatus(full, found);
    else if (entry.name === 'page.tsx' && STATUS_CALL.test(fs.readFileSync(full, 'utf8'))) {
      found.push(full);
    }
  }
  return found;
}

const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/');

for (const page of pagesThatSetStatus(APP)) {
  // Walk from the page's own directory up to app/, inclusive.
  let dir = path.dirname(page);
  for (;;) {
    const loading = path.join(dir, 'loading.tsx');
    if (fs.existsSync(loading)) {
      failures.push(
        `${rel(page)} sets an HTTP status, but ${rel(loading)} streams a fallback above it`,
      );
    }
    const layout = path.join(dir, 'layout.tsx');
    if (fs.existsSync(layout) && /<Suspense[\s>]/.test(fs.readFileSync(layout, 'utf8'))) {
      failures.push(
        `${rel(page)} sets an HTTP status, but ${rel(layout)} wraps children in <Suspense>`,
      );
    }
    if (path.resolve(dir) === path.resolve(APP)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

if (failures.length) {
  console.error('\nSuspense/status guard FAILED:\n');
  for (const f of failures) console.error('  x ' + f);
  console.error(
    '\n  A streamed fallback commits the 200 before the page decides. Move the\n' +
      '  boundary below the route, or drop it, see scripts/guard-suspense.mjs.\n',
  );
  process.exit(1);
}
console.warn('Suspense/status guard passed.');
