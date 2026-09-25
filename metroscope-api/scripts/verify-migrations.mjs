import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Recorded is not the same as applied (§3.7's silent failure).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run verify:migrations
 *
 * `0027` used `$fn$ ... $fn$` to quote a trigger function body. drizzle-kit
 * splits a migration into statements before sending it, its splitter did not
 * recognise the custom dollar tag, and the halves were sent as separate
 * statements. The run printed no error. `__drizzle_migrations` gained a row.
 * The trigger and four columns did not exist. Every subsequent test that did
 * not touch them passed.
 *
 * The lesson is not "avoid dollar quoting". It is that the migration journal
 * records an INTENTION and nothing in the pipeline was checking the RESULT.
 *
 * So this reads every migration, extracts the objects it claims to create, and
 * asks the catalog whether they are there. The expectations are parsed rather
 * than listed, because a hand-written list is a second thing to forget: adding
 * a migration adds its objects to the expected set automatically, and a
 * migration that half-applies fails here whatever it half-applied.
 */
loadEnvLocal();

const DIR = path.join(process.cwd(), 'supabase', 'migrations');
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `, ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/**
 * Comments are stripped first. Several migrations discuss the objects they are
 * *not* creating, and a parser that reads prose finds objects nobody asked for,
 * the 0024 header alone names an `ALTER DEFAULT PRIVILEGES` line as an
 * illustration of the bug it fixes.
 */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

const expected = {
  tables: new Map(),
  functions: new Map(),
  triggers: new Map(),
  indexes: new Map(),
  columns: new Map(),
  types: new Map(),
  constraints: new Map(),
};

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const body = stripComments(fs.readFileSync(path.join(DIR, file), 'utf8'));

  for (const m of body.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    expected.tables.set(m[1].toLowerCase(), file);

  for (const m of body.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi,
  ))
    expected.functions.set(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`, file);

  for (const m of body.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?([a-z_][a-z0-9_]*)"?[\s\S]{0,200}?\sON\s+"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    expected.triggers.set(`${m[2].toLowerCase()}.${m[1].toLowerCase()}`, file);

  for (const m of body.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    expected.indexes.set(m[1].toLowerCase(), file);

  /**
   * One `ALTER TABLE` can add several columns:
   *
   *   ALTER TABLE sessions
   *     ADD COLUMN gcal_calendar_id text,
   *     ADD COLUMN gcal_sync_status calendar_sync_status,
   *     …
   *
   * The first version of this matched `ALTER TABLE <t> ADD COLUMN <c>` and
   * therefore saw only the first column of the list, 0029 added four and this
   * expected one. A verifier that under-counts is the failure it exists to
   * prevent, wearing a different hat. So the statement is captured first, then
   * every ADD COLUMN inside it.
   */
  for (const stmt of body.matchAll(
    /ALTER\s+TABLE\s+"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?([\s\S]*?);/gi,
  )) {
    const table = stmt[1].toLowerCase();
    for (const col of stmt[2].matchAll(
      /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
    )) {
      expected.columns.set(`${table}.${col[1].toLowerCase()}`, file);
    }
    for (const con of stmt[2].matchAll(/ADD\s+CONSTRAINT\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
      expected.constraints.set(con[1].toLowerCase(), file);
    }
  }

  for (const m of body.matchAll(
    /CREATE\s+TYPE\s+"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+AS\s+ENUM/gi,
  ))
    expected.types.set(m[1].toLowerCase(), file);

  // A later migration may legitimately remove what an earlier one created.
  for (const m of body.matchAll(
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    expected.tables.delete(m[1].toLowerCase());
  for (const m of body.matchAll(
    /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi,
  ))
    expected.functions.delete(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  for (const m of body.matchAll(
    /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s+ON\s+"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    expected.triggers.delete(`${m[2].toLowerCase()}.${m[1].toLowerCase()}`);
  for (const m of body.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi))
    expected.indexes.delete(m[1].toLowerCase());
  for (const m of body.matchAll(
    /ALTER\s+TABLE\s+"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
  ))
    expected.columns.delete(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
}

const sql = postgres(required('DIRECT_URL'), { max: 1 });

try {
  // ═══ 1. THE JOURNAL AGREES WITH THE DISK ════════════════════════════
  section('1. Journal, disk and database agree');

  const journal = JSON.parse(fs.readFileSync(path.join(DIR, 'meta', '_journal.json'), 'utf8'));
  const journalTags = journal.entries.map((e) => e.tag);
  const diskTags = files.map((f) => f.replace(/\.sql$/, ''));

  const missingFromJournal = diskTags.filter((t) => !journalTags.includes(t));
  const missingFromDisk = journalTags.filter((t) => !diskTags.includes(t));
  check(
    'every migration file is in the journal',
    missingFromJournal.length === 0,
    missingFromJournal.join(', '),
  );
  check('every journal entry has a file', missingFromDisk.length === 0, missingFromDisk.join(', '));

  const applied = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  check(
    'the database has applied as many as the journal lists',
    applied[0].n >= journalTags.length,
    `${applied[0].n} applied, ${journalTags.length} in journal`,
  );

  // ═══ 2. THE OBJECTS ARE ACTUALLY THERE ══════════════════════════════
  section('2. Every object the migrations claim to create exists');

  const have = {
    tables: new Set(
      (
        await sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`
      ).map((r) => r.relname),
    ),
    functions: new Set(
      (
        await sql`SELECT n.nspname || '.' || p.proname AS f FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname IN ('public','app')`
      ).map((r) => r.f),
    ),
    triggers: new Set(
      (
        await sql`SELECT c.relname || '.' || t.tgname AS t FROM pg_trigger t
                 JOIN pg_class c ON c.oid = t.tgrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND NOT t.tgisinternal`
      ).map((r) => r.t),
    ),
    indexes: new Set(
      (await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`).map(
        (r) => r.indexname,
      ),
    ),
    columns: new Set(
      (
        await sql`SELECT table_name || '.' || column_name AS c FROM information_schema.columns
                 WHERE table_schema = 'public'`
      ).map((r) => r.c),
    ),
    constraints: new Set(
      (
        await sql`SELECT c.conname FROM pg_constraint c
                 JOIN pg_class r ON r.oid = c.conrelid
                 JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE n.nspname = 'public'`
      ).map((r) => r.conname),
    ),
    types: new Set(
      (
        await sql`SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typtype = 'e'`
      ).map((r) => r.typname),
    ),
  };

  for (const [kind, label] of [
    ['tables', 'table'],
    ['types', 'enum type'],
    ['functions', 'function'],
    ['triggers', 'trigger'],
    ['indexes', 'index'],
    ['columns', 'column'],
    ['constraints', 'constraint'],
  ]) {
    const missing = [...expected[kind].entries()].filter(([name]) => !have[kind].has(name));
    check(
      `${expected[kind].size} ${label}(s) declared across ${files.length} migrations`,
      missing.length === 0,
      missing.map(([n, f]) => `${n} (${f})`).join(', '),
    );
  }

  // ═══ 3. THE ONES §3.7 LOST ══════════════════════════════════════════
  section('3. Named explicitly: the objects that were silently missing');

  /**
   * The parse above would already catch these. They are also named here,
   * because the class of failure was "a check nobody wrote", and the four
   * columns plus two triggers of 0027 are the concrete thing that went missing
   * while every green tick in the repository stayed green.
   */
  for (const col of [
    'articles.competition_id',
    'articles.competition_target_id',
    'articles.consent_source',
    'articles.consent_at',
  ]) {
    check(`column ${col}`, have.columns.has(col));
  }
  for (const trg of [
    'competition_targets.competition_target_won_insert',
    'competition_targets.competition_target_won_update',
  ]) {
    check(`trigger ${trg}`, have.triggers.has(trg));
  }
  check(
    'function app.draft_achievement_article',
    have.functions.has('app.draft_achievement_article'),
  );
  check(
    'the idempotency index articles_competition_target_uq',
    have.indexes.has('articles_competition_target_uq'),
  );

  // ═══ 4. THE FUNCTIONS RUN ═══════════════════════════════════════════
  section('4. Existing is not the same as working');

  /**
   * A function can exist and still be wrong, `0027`'s first version parsed,
   * created and returned the raw enum `NATIONAL` in Indonesian prose. Calling
   * the policy-critical helpers proves they are callable and typed as the
   * policies assume; the suites prove what they return.
   */
  const callable = async (label, stmt) => {
    try {
      await sql.unsafe(stmt);
      check(label, true);
    } catch (e) {
      check(label, false, e.message.split('\n')[0]);
    }
  };
  await callable('app.progress_status(timestamptz)', `SELECT app.progress_status(now())`);
  await callable('app.days_since_wita(timestamptz)', `SELECT app.days_since_wita(now())`);
  await callable('app.progress_stale_days()', `SELECT app.progress_stale_days()`);
  await callable('app.assessment_period()', `SELECT app.assessment_period()`);
  await callable(
    'app.competition_phase(timestamptz, timestamptz)',
    `SELECT app.competition_phase(now(), now())`,
  );
  /**
   * These two read `request.jwt.claims`, so they are only meaningful inside a
   * request. Called bare they raise `invalid input syntax for type json` on the
   * empty setting, which is the function working, not failing. They are
   * therefore called the way `asUser()` calls them, with claims set.
   */
  await callable(
    'app.current_user_id() with claims set',
    `SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true),
            app.current_user_id()`,
  );
  await callable(
    'app.is_staff() with claims set',
    `SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true),
            app.is_staff()`,
  );

  // ═══ 5. POLICIES ════════════════════════════════════════════════════
  section('5. Policy files are applied, not merely present');

  /**
   * Policies live outside the migrations (`supabase/policies/`, applied by
   * `npm run db:policies`) so they can be re-applied idempotently. That makes
   * them a second thing that can be recorded and not applied.
   */
  const policyDir = path.join(process.cwd(), 'supabase', 'policies');
  const declared = new Set();
  for (const f of fs.readdirSync(policyDir).filter((f) => f.endsWith('.sql'))) {
    const body = stripComments(fs.readFileSync(path.join(policyDir, f), 'utf8'));
    for (const m of body.matchAll(
      /CREATE\s+POLICY\s+"?([a-z_][a-z0-9_]*)"?\s+ON\s+"?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    ))
      declared.add(`${m[2].toLowerCase()}.${m[1].toLowerCase()}`);
  }
  const livePolicies = new Set(
    (
      await sql`SELECT tablename || '.' || policyname AS p FROM pg_policies WHERE schemaname = 'public'`
    ).map((r) => r.p),
  );
  const missingPolicies = [...declared].filter((p) => !livePolicies.has(p));
  check(
    `${declared.size} declared policies are all live`,
    missingPolicies.length === 0,
    missingPolicies.join(', '),
  );
  check(`${livePolicies.size} policies across the schema`, livePolicies.size >= declared.size);
} finally {
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
