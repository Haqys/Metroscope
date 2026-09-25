import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * Apply every file in supabase/policies/ in filename order.
 *
 * Policies are NOT migrations. A migration describes a one-way change to the
 * shape of the database; a policy is a statement of current intent that gets
 * edited as roles evolve. Expressing "payment.verify may now also void" as a
 * numbered migration means reading the whole migration history to know what the
 * rule is today. So every file here is idempotent (DROP POLICY IF EXISTS then
 * CREATE, CREATE OR REPLACE FUNCTION) and the whole directory is re-applied on
 * each deploy, converging to whatever the files currently say.
 *
 * Runs in ONE transaction: a syntax error in file 5 must not leave the database
 * half-protected, with tables 1-4 open and the rest closed.
 *
 * Deploy order is migrate -> policies -> seed.
 */
const DIR = path.join(process.cwd(), 'supabase', 'policies');
const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * Refuse to run when a migration redefines something this directory owns.
 *
 * This directory re-applies on every deploy, so whatever it says always wins.
 * A migration that also defines the same function is therefore not a change,
 * it is a change that gets reverted the next time anyone deploys, silently.
 *
 * That happened: three migrations fixed `app.guard_invoice_columns()` and all
 * three were undone by the next `db:policies`, putting the live database back
 * to a version where a guardian could not submit a transfer proof. Nothing
 * failed. The tests caught it; nothing else would have.
 *
 * Migrations that PRE-DATE the policy file are fine. They are how the object
 * first came to exist. Only names still being redefined in both places are a
 * problem, so this compares the current text of both.
 */
function assertNoDuplicateDefinitions() {
  if (!fs.existsSync(MIGRATIONS)) return;

  const owned = new Set();
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.sql'))) {
    const body = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const m of body.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([\w.]+)\s*\(/gi)) {
      owned.add(m[1].toLowerCase());
    }
  }

  const clashes = [];
  for (const f of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
    const body = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    for (const m of body.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([\w.]+)\s*\(/gi)) {
      const name = m[1].toLowerCase();
      if (owned.has(name)) clashes.push(`${f} redefines ${m[1]}`);
    }
  }

  if (clashes.length) {
    console.error('\nPolicy apply REFUSED, a migration redefines a policy-owned function:\n');
    for (const c of clashes) console.error('  x ' + c);
    console.error(
      '\n  This directory re-applies on every deploy, so the migration would be\n' +
        '  silently reverted. Move the change into supabase/policies/ instead, and\n' +
        '  reduce the migration to a comment recording what it originally did.\n',
    );
    process.exit(1);
  }
}

async function main() {
  loadEnvLocal();

  if (!fs.existsSync(DIR)) {
    throw new Error(`No policy directory at ${DIR}`);
  }

  assertNoDuplicateDefinitions();
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) throw new Error(`No .sql files in ${DIR}`);

  const sql = postgres(required('DIRECT_URL'), { max: 1, connect_timeout: 15 });

  try {
    console.log('\nApplying policies');
    await sql.begin(async (tx) => {
      // Every file opens with DROP POLICY IF EXISTS, so a first run emits one
      // NOTICE per policy. That is expected, and drowns out anything real.
      await tx.unsafe('SET LOCAL client_min_messages = warning');
      for (const file of files) {
        const body = fs.readFileSync(path.join(DIR, file), 'utf8');
        await tx.unsafe(body);
        console.log(`  ${file}`);
      }
    });

    // Report the resulting posture rather than just claiming success.
    const [{ tables }] = await sql`
      SELECT count(*)::int AS tables
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    `;
    const [{ policies }] = await sql`
      SELECT count(*)::int AS policies FROM pg_policies WHERE schemaname = 'public'
    `;

    const unprotected = await sql`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      ORDER BY 1
    `;

    console.log(`\n  RLS-enabled tables : ${tables}`);
    console.log(`  policies           : ${policies}`);

    if (unprotected.length) {
      console.log(`\n  ⚠️  RLS OFF on: ${unprotected.map((r) => r.relname).join(', ')}`);
      console.log('     Any table without RLS is fully readable and writable by the');
      console.log('     anon key, which ships in browser bundles.');
      process.exitCode = 1;
    }
    console.log('');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\nPolicy apply failed:', err.message);
  process.exit(1);
});
