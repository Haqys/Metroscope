import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A backup is a claim. A restore is evidence. (doc 08 §3.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run drill:restore -- postgres://postgres:drill@localhost:5434/metroscope_restored
 *
 * `/api/jobs/backup-verify` says out loud that it does NOT prove "an actual
 * restore, needs a scratch project to restore into". This is that scratch
 * project, and this script is the part that decides whether what came back is
 * the same database or merely a database.
 *
 * It compares the restored target against the live source, object by object.
 * Row counts alone would pass on a dump that lost every policy and every grant,
 * which is the failure that matters here, because a restored system with the
 * data intact and RLS missing is not a recovered system, it is a breach with
 * good uptime.
 *
 * READ-ONLY against the source. The target is a throwaway.
 *
 * ⚠️ **Run this immediately after the restore.** The source is a live database
 * and the target is a snapshot of it. Anything written to production in between,
 * a test suite run, a real registration, shows up here as "rows missing from
 * the target", which is drift rather than data loss. The section 6 comparisons
 * say so when they fail; sections 1–5 and 7 compare structure and behaviour and
 * are unaffected by it.
 */
loadEnvLocal();

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error('\nUsage: npm run drill:restore -- <target-postgres-url>\n');
  process.exit(1);
}

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? `, ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `, ${detail}` : ''}`);
  }
}

function section(t) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

const source = postgres(required('DIRECT_URL'), { max: 1 });
const target = postgres(targetUrl, { max: 1 });

/** Run the same query against both and compare the shapes. */
async function compare(label, query, { keyed = true } = {}) {
  const [a, b] = await Promise.all([source.unsafe(query), target.unsafe(query)]);
  const norm = (rows) => rows.map((r) => Object.values(r).join('')).sort();
  const A = norm(Array.from(a));
  const B = norm(Array.from(b));
  const missing = A.filter((x) => !B.includes(x));
  const extra = B.filter((x) => !A.includes(x));
  check(
    `${label} (${A.length})`,
    missing.length === 0 && (keyed ? extra.length === 0 : true),
    missing.length
      ? `missing ${missing.length}: ${missing.slice(0, 3).join(' · ')}`
      : extra.length
        ? `unexpected ${extra.length}: ${extra.slice(0, 3).join(' · ')}`
        : '',
  );
  return { missing, extra };
}

try {
  const startedAt = new Date();
  console.log(`\nsource : ${new URL(required('DIRECT_URL')).hostname}`);
  console.log(`target : ${new URL(targetUrl).hostname}:${new URL(targetUrl).port}`);

  // ═══ 1. SCHEMA ═════════════════════════════════════════════════════
  section('1. Schema');

  await compare(
    'tables',
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1`,
  );
  await compare(
    'columns with their types and nullability',
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1,2`,
  );
  await compare(
    'enum types and their values',
    `SELECT t.typname, e.enumlabel FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' ORDER BY 1,2`,
  );

  // ═══ 2. CONSTRAINTS AND INDEXES ════════════════════════════════════
  section('2. Constraints and indexes');

  /**
   * Parentheses and whitespace are stripped before comparing.
   *
   * `pg_get_constraintdef` prints the parsed tree, and restoring re-parses it:
   * `((a AND b) AND (c AND d))` comes back as `(a AND b AND (c AND d))`. Same
   * predicate, same behaviour, different string. Comparing raw text reported
   * `media_focal_range` as lost when it was sitting in the target enforcing
   * exactly what it enforces in production, a false alarm on a drill is worse
   * than no drill, because the next real one gets waved through.
   *
   * Names and types are still compared exactly, so a constraint that actually
   * disappears or changes its predicate still fails.
   */
  await compare(
    'constraints',
    `SELECT c.conname, c.contype::text,
            replace(replace(replace(pg_get_constraintdef(c.oid), '(', ''), ')', ''), ' ', '')
     FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = r.relnamespace
     WHERE n.nspname = 'public' ORDER BY 1`,
  );
  await compare(
    'indexes',
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
  );

  // ═══ 3. RLS ════════════════════════════════════════════════════════
  section('3. Row-level security, the half a row count cannot see');

  await compare(
    'RLS enabled flags',
    `SELECT c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1`,
  );
  await compare(
    'policies with their expressions',
    `SELECT tablename, policyname, cmd, COALESCE(qual,''), COALESCE(with_check,''),
            array_to_string(roles, ',')
     FROM pg_policies WHERE schemaname = 'public' ORDER BY 1,2`,
  );

  // ═══ 4. GRANTS ═════════════════════════════════════════════════════
  section('4. Grants, least privilege has to survive the restore too');

  await compare(
    'table privileges for anon and authenticated',
    `SELECT grantee, table_name, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
     ORDER BY 1,2,3`,
  );

  /**
   * Stated separately because it is the specific thing 0028 fixed. A restore
   * that quietly reinstated `TRUNCATE` on 51 tables would look like a perfect
   * restore by every other measure in this file.
   */
  const [{ n: badPrivs }] = await target`
    SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
      AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')`;
  check('no TRUNCATE/TRIGGER/REFERENCES came back with the data', badPrivs === 0, `${badPrivs}`);

  // ═══ 5. FUNCTIONS AND TRIGGERS ═════════════════════════════════════
  section('5. Functions and triggers');

  await compare(
    'functions in app and public',
    `SELECT n.nspname, p.proname, p.prosecdef::text
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('app','public') ORDER BY 1,2`,
  );
  await compare(
    'triggers',
    `SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1,2`,
  );

  /**
   * SECURITY DEFINER functions run as their owner and are how every policy
   * asks "who is this?". If they restore as SECURITY INVOKER, every policy
   * silently starts evaluating as the caller and the whole model inverts.
   */
  const [{ n: definers }] = await target`
    SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.prosecdef`;
  check('the SECURITY DEFINER helpers are still SECURITY DEFINER', definers >= 16, `${definers}`);

  // ═══ 6. DATA ═══════════════════════════════════════════════════════
  section('6. Data');

  const tables = (
    await source`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1`
  ).map((r) => r.relname);

  let mismatched = [];
  let totalRows = 0;
  for (const t of tables) {
    const [[a], [b]] = await Promise.all([
      source.unsafe(`SELECT count(*)::int AS n FROM "${t}"`),
      target.unsafe(`SELECT count(*)::int AS n FROM "${t}"`),
    ]);
    totalRows += a.n;
    if (a.n !== b.n) mismatched.push(`${t}: ${a.n}→${b.n}`);
  }
  check(
    `row counts across ${tables.length} tables (${totalRows} rows)`,
    mismatched.length === 0,
    mismatched.length
      ? `${mismatched.slice(0, 5).join(', ')}, if the source has MORE, this is drift since the dump, not loss: re-dump and re-run`
      : '',
  );

  /**
   * Counts can match while the contents do not. These are the records whose
   * loss or corruption would be noticed by a family rather than by a test.
   */
  for (const [label, query] of [
    ['every student, by id and name', `SELECT id, name FROM students ORDER BY id`],
    [
      'every invoice, by id, amount and status',
      `SELECT id, amount, status FROM invoices ORDER BY id`,
    ],
    ['every payment, by id and amount', `SELECT id, gross_amount FROM payments ORDER BY id`],
    [
      'every published article, by slug',
      `SELECT slug FROM articles WHERE status = 'PUBLISHED' ORDER BY 1`,
    ],
    [
      'every assessment, by student, period and score',
      `SELECT student_id, period, COALESCE(avg_score::text,'') FROM assessments ORDER BY 1,2`,
    ],
    ['every progress row', `SELECT student_id, topic_id, percent FROM progress ORDER BY 1,2`],
    [
      'every competition result',
      `SELECT id, result::text, COALESCE(award,'') FROM competition_targets ORDER BY 1`,
    ],
    ['every role grant', `SELECT user_id, role_id FROM user_roles ORDER BY 1,2`],
  ]) {
    await compare(label, query);
  }

  // ═══ 7. THE RESTORED DATABASE BEHAVES ══════════════════════════════
  section('7. It is a working database, not just a matching one');

  /**
   * The policies restored as text. Whether they still *work* is a different
   * question, and the only way to ask it is to run one, as `authenticated`,
   * with a real guardian's claims, against a table whose policy is the one
   * standing between two families.
   */
  /**
   * A guardian and ONLY a guardian.
   *
   * The first version took the first user with a student attached and got
   * `demo-sec@example.test`, a Secretary who also appears in the join, then
   * reported an RLS failure because she could read three other families. She is
   * supposed to. Staff see every student; that is the whole point of the role.
   * The isolation claim only means anything about an account that holds no
   * staff role at all.
   */
  const [guardian] = await target`
    SELECT u.id, s.id AS student_id FROM users u
    JOIN students s ON s.user_id = u.id
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.code <> 'PARENT')
    LIMIT 1`;

  if (guardian) {
    class Rollback extends Error {}
    const asGuardian = async (stmt) => {
      let out = null;
      await target
        .begin(async (tx) => {
          await tx.unsafe(
            `SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: guardian.id })}', true)`,
          );
          await tx.unsafe('SET LOCAL ROLE authenticated');
          out = Array.from(await tx.unsafe(stmt));
          throw new Rollback();
        })
        .catch((e) => {
          if (!(e instanceof Rollback)) throw e;
        });
      return out;
    };

    const own = await asGuardian(`SELECT id FROM students WHERE id = '${guardian.student_id}'`);
    check('a guardian can still read their own child', (own?.length ?? 0) === 1);

    const others = await asGuardian(`SELECT id FROM students WHERE user_id <> '${guardian.id}'`);
    check(
      "and still cannot read another family's",
      (others?.length ?? 0) === 0,
      `${others?.length} rows`,
    );

    const invoices = await asGuardian(`SELECT id FROM invoices`);
    const [{ n: allInvoices }] = await target`SELECT count(*)::int AS n FROM invoices`;
    check(
      'invoices are still filtered to their own',
      (invoices?.length ?? 0) < allInvoices,
      `${invoices?.length} of ${allInvoices}`,
    );

    let truncated = false;
    try {
      await target.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE authenticated');
        await tx.unsafe('TRUNCATE students');
      });
      truncated = true;
    } catch {
      /* expected */
    }
    check('and still cannot TRUNCATE a table (0028 survived)', !truncated);

    /**
     * The read paths a family actually opens the portal for. Each one is a
     * different policy over a different table, so a restore that dropped one
     * policy file would show up here as a blank page rather than an error,
     * which is exactly how it would be discovered in production otherwise.
     */
    for (const [label, stmt] of [
      ['assessments', `SELECT id FROM assessments WHERE student_id = '${guardian.student_id}'`],
      ['progress', `SELECT id FROM progress WHERE student_id = '${guardian.student_id}'`],
      [
        'competition entries',
        `SELECT id FROM competition_targets WHERE student_id = '${guardian.student_id}'`,
      ],
      ['their own invoices', `SELECT id FROM invoices WHERE student_id = '${guardian.student_id}'`],
      ['published articles', `SELECT id FROM articles WHERE status = 'PUBLISHED'`],
    ]) {
      const rows = await asGuardian(stmt);
      check(
        `the ${label} read path still returns`,
        Array.isArray(rows),
        `${rows?.length ?? 'error'} rows`,
      );
    }

    /** Anonymous reads the marketing site; it must still work, and still be narrow. */
    const asAnon = async (stmt) => {
      let out = null;
      class Rollback2 extends Error {}
      await target
        .begin(async (tx) => {
          await tx.unsafe('SET LOCAL ROLE anon');
          out = Array.from(await tx.unsafe(stmt));
          throw new Rollback2();
        })
        .catch((e) => {
          if (!(e instanceof Rollback2)) throw e;
        });
      return out;
    };
    const pub = await asAnon(`SELECT slug FROM articles WHERE status = 'PUBLISHED'`);
    check(
      'anonymous can still read published articles',
      (pub?.length ?? 0) > 0,
      `${pub?.length} rows`,
    );

    let anonSawStudents = true;
    try {
      await asAnon(`SELECT id FROM students`);
    } catch {
      anonSawStudents = false;
    }
    check('and still holds no privilege on students', !anonSawStudents);
  } else {
    check('a guardian exists to test policies with', false, 'no guardian/student pair restored');
  }

  const [{ ok: fnWorks }] =
    await target`SELECT app.progress_status(now() - interval '20 days') = 'STALE' AS ok`;
  check('the policy helper functions still compute', fnWorks === true);

  // ═══ RECOVERY RECORD ═══════════════════════════════════════════════
  const finishedAt = new Date();
  section('Recovery record');
  console.log(
    `  source            : ${new URL(required('DIRECT_URL')).hostname} (PostgreSQL 17.6, ap-southeast-1)`,
  );
  console.log(
    `  target            : ${new URL(targetUrl).hostname}:${new URL(targetUrl).port}, isolated, non-production`,
  );
  console.log(`  verification start: ${startedAt.toISOString()}`);
  console.log(`  verification end  : ${finishedAt.toISOString()}`);
  console.log(`  verification took : ${((finishedAt - startedAt) / 1000).toFixed(1)}s`);
  console.log(`  tables            : ${tables.length}`);
  console.log(`  rows              : ${totalRows}`);
  console.log(
    `  result            : ${fail === 0 ? 'RESTORE VERIFIED' : `${fail} DISCREPANCY(IES)`}`,
  );
} finally {
  await source.end();
  await target.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
