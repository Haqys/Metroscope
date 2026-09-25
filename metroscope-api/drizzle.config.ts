import fs from 'node:fs';
import path from 'node:path';
import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit is a standalone CLI, unlike the Next.js runtime it does not load
 * `.env.local`, so we read it here. Real environment variables always win, which
 * is what lets CI supply `DIRECT_URL` with no file on disk.
 */
function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(eq + 1).trim();
  }
}

loadEnvLocal();

const url = process.env.DIRECT_URL;
if (!url) {
  throw new Error(
    'DIRECT_URL is required for migrations. Use the Supabase direct connection on :5432, ' +
      'the runtime pooler on :6543 cannot run DDL reliably (doc 08 §2.4).',
  );
}

/**
 * Migrations use the DIRECT connection (:5432) and run in CI only.
 * Runtime uses the Supavisor pooler (:6543), see lib/db/client.ts.
 */
export default {
  schema: './db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
