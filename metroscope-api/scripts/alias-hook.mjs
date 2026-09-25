import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Resolve `@/…` the way Next does, for scripts that run under plain Node.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `@/lib/db/client` is a tsconfig path alias. Next's bundler understands it;
 * `node` does not, and answers `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`.
 *
 * That is why `verify:calendar` could not import the calendar service. The
 * failure had been sitting there since the integration was written and stayed
 * invisible for a simple reason: with no Google credentials the script exits at
 * its BLOCKED gate *before* the import runs. Configure a service account, the
 * one thing that makes the script meaningful, and it breaks.
 *
 * `test:calendar` sidestepped this by importing a dependency-free leaf module.
 * That works for a pure function and cannot work for the service, which needs
 * the database client, the logger and the Google credentials. So the alias is
 * taught to Node instead.
 *
 * Used as:  node --import ./scripts/register-alias.mjs script.mjs
 */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** The extensions a TS project omits, in the order Node should try them. */
const CANDIDATES = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.mjs', '/index.js'];

/** First existing file for a base path, trying the extensions TS lets you omit. */
function firstExisting(base) {
  for (const ext of CANDIDATES) {
    const candidate = base + ext;
    if (candidate && existsSync(candidate) && !candidate.endsWith(path.sep)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  // ── `@/…` → project root ──
  if (specifier.startsWith('@/')) {
    const found = firstExisting(path.join(ROOT, specifier.slice(2)));
    if (found) {
      /**
       * Short-circuit: passing this on would re-trigger the bare-specifier
       * lookup that failed in the first place.
       */
      return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    throw new Error(`alias-hook: no file for "${specifier}" under ${ROOT}`);
  }

  /**
   * ── extensionless RELATIVE imports ──
   *
   * `import { googleCredentials } from './credentials'` is ordinary TypeScript
   * and ordinary breakage under Node ESM, which requires the extension. The
   * alias is only half the problem: once `@/lib/google/calendar.ts` loads, its
   * own `./credentials` fails the same way.
   *
   * Attempted only AFTER the default resolver declines, so nothing that already
   * resolves is second-guessed.
   */
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    try {
      return await next(specifier, context);
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
      const parent = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : ROOT;
      const found = firstExisting(path.resolve(parent, specifier));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
      throw err;
    }
  }

  return next(specifier, context);
}
