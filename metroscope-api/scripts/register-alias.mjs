import { register } from 'node:module';

/**
 * Installs `alias-hook.mjs` so `@/…` imports resolve under plain Node.
 *
 *   node --import ./scripts/register-alias.mjs some-script.mjs
 *
 * Separate from the hook itself because `register()` must run on the main
 * thread while the hook runs on the loader thread.
 *
 * The parent is `import.meta.url` as-is. It is ALREADY a `file://` URL, so
 * passing it through `pathToFileURL` produces `…/metroscope-api/file:/G:/…`
 * and the hook cannot be found.
 */
register('./alias-hook.mjs', import.meta.url);
