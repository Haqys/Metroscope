import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env.local reader for standalone CLI scripts.
 *
 * Next.js loads .env files itself, but drizzle-kit and these scripts run outside
 * it. Deliberately NOT a dotenv clone: it does no variable expansion, which is
 * the whole point. Next runs dotenv-expand, so a `$` in a password is
 * substituted with an empty variable and the credential arrives truncated,
 * which is why connection strings are percent-encoded (`%24`). Expanding here
 * too would reintroduce the bug in every script.
 *
 * Real environment variables always win, so CI can supply values with no file.
 */
export function loadEnvLocal(dir = process.cwd()) {
  const file = path.join(dir, '.env.local');
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;

    // Strip one layer of surrounding quotes; keep everything else verbatim.
    process.env[key] = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
}

/** Read a required variable, failing loudly rather than at a confusing later point. */
export function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local or the environment.`);
  }
  return value;
}
