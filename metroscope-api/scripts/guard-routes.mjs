import fs from 'fs';
import path from 'path';

/**
 * CI guard: every Route Handler under app/api/v1 must declare its security
 * contract. Next.js cannot enforce this the way a framework with guards would,
 * so we do (doc 15 section 2, rule 3).
 */
const ROOT = path.join(process.cwd(), 'app', 'api');
const failures = [];

function check(file) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  if (/(health|jobs|webhooks)/.test(rel)) return; // own verification paths

  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('handler(')) {
    failures.push(rel + ': does not use the handler() wrapper');
    return;
  }
  if (!/auth:\s*.(required|public)./.test(src)) {
    failures.push(rel + ': missing auth declaration');
  }
  const isPublic = /auth:\s*.public./.test(src);
  const hasWrite = /export const (POST|PATCH|PUT|DELETE)/.test(src);

  /**
   * app/api/v1/auth/* is the authentication boundary itself, so the 16 action
   * verbs do not apply, every one of them presupposes an established identity,
   * and requiring, say, settings.edit to log out would be nonsense. These
   * routes are still checked for the auth declaration above, and each carries
   * its own rate limit.
   */
  const isAuthRoute = /^app\/api\/v1\/auth\//.test(rel);

  /**
   * A customer acting on their own row, authorised by ownership, not a grant.
   * The route must say so explicitly with `ownerWrite: true`; the point is that
   * a MISSING action stays an error, while a deliberate one is declared and
   * reviewable in the diff.
   */
  const isOwnerWrite = /ownerWrite:\s*true/.test(src);

  if (!isPublic && hasWrite && !isAuthRoute && !isOwnerWrite && !/action:\s*./.test(src)) {
    failures.push(rel + ': authenticated write without an action grant or ownerWrite');
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name === 'route.ts') check(full);
  }
}

walk(ROOT);

/**
 * Every cron in vercel.json must point at a route that exists.
 *
 * Three did not: `session-remind`, `assessment-remind` and `content-publish`
 * were written for features that had not been built. Vercel does not validate
 * paths, so they deployed happily and produced a 404 on every tick. One of
 * them every five minutes. The failure is invisible precisely because nothing
 * downstream depends on a job that was never real, which is what let them sit
 * there. The reverse (a job route with no cron) is fine: `dispatch` is invoked
 * by QStash, not on a schedule.
 */
function checkCrons() {
  const file = path.join(process.cwd(), 'vercel.json');
  if (!fs.existsSync(file)) return;

  const { crons = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const { path: p } of crons) {
    // A cron path is a URL; the handler for it lives under app/.
    const route = path.join(process.cwd(), 'app', p.replace(/^\//, ''), 'route.ts');
    if (!fs.existsSync(route)) {
      failures.push(
        `vercel.json: cron "${p}" has no route (${path.relative(process.cwd(), route)})`,
      );
    }
  }
}

/**
 * One rate-limit key, one limit.
 *
 * `lib/ratelimit.ts` caches a limiter per `key:limit:window` but prefixes the
 * Redis entries with the KEY alone. Two routes sharing a key with different
 * limits therefore write to the same sliding window while disagreeing about
 * how full it is, the tighter route starts failing based on the looser one's
 * traffic, which is indistinguishable from a flaky endpoint.
 *
 * Found by `test:media`: purge was capped at 30 while five sibling routes wrote
 * to `media.write` at 60, so a legitimate bulk session exhausted purge's budget
 * without ever calling it.
 */
function checkRateLimitKeys() {
  const seen = new Map(); // key -> "limit window"
  const walkFiles = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkFiles(full);
      else if (e.name === 'route.ts') {
        const src = fs.readFileSync(full, 'utf8');
        const re = /key:\s*'([^']+)',\s*limit:\s*(\d+),\s*window:\s*'([^']+)'/g;
        for (const m of src.matchAll(re)) {
          const [, key, limit, window] = m;
          const spec = `${limit} per ${window}`;
          const prior = seen.get(key);
          if (prior && prior.spec !== spec) {
            failures.push(
              `rate-limit key "${key}" has two limits: ${prior.spec} (${prior.file}) vs ${spec} (${path.relative(process.cwd(), full).replace(/\\/g, '/')})`,
            );
          } else if (!prior) {
            seen.set(key, { spec, file: path.relative(process.cwd(), full).replace(/\\/g, '/') });
          }
        }
      }
    }
  };
  walkFiles(ROOT);
}

checkCrons();
checkRateLimitKeys();

if (failures.length) {
  console.error('\nRoute security guard FAILED:\n');
  for (const f of failures) console.error('  x ' + f);
  process.exit(1);
}
console.warn('Route security guard passed.');
