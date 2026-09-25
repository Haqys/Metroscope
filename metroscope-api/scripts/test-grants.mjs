import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Table privileges, the gate RLS is not (doc 04 §0.3, migration 0028).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run test:grants
 *
 * Every other suite in this repo asks "was the request refused?". That question
 * cannot distinguish a policy doing its job from a privilege nobody happens to
 * be exercising, and §3.4 learned the difference the expensive way: `anon` held
 * `arwdDxtm` on every table for the entire life of the project while every test
 * passed, because no test ever asked what `anon` was *allowed* to do.
 *
 * So these assertions read the catalog. They check the PROPERTY, the grant is
 * absent, rather than the symptom, and they check it for tables that do not
 * exist yet, because the thing that granted it in the first place was a default
 * ACL rather than any line of SQL anybody wrote.
 *
 * Three privileges must never appear:
 *
 *   TRUNCATE   RLS does not filter it. A policy is not a weaker gate here, it
 *              is no gate, and the statement empties the table.
 *   TRIGGER    attaching code to a table you do not own.
 *   REFERENCES leaks values through FK constraint checks.
 */

const TAG = 'grants-test';
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `, ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/**
 * Every table the application issues a `DELETE FROM` against, and therefore the
 * complete set that may hold DELETE. Kept here as well as in 0028 on purpose:
 * the migration is the grant, this is the claim about it, and a change to one
 * that is not a change to the other is exactly what this file exists to catch.
 */
const DELETE_ALLOWED = [
  'article_categories',
  'article_tags',
  'articles',
  'assessment_claims',
  'competition_targets',
  'material_assignments',
  'material_resources',
  'media_assets',
  'media_usage',
  'mentor_availability',
  'page_blocks',
  'pages',
  'programs',
  'role_actions',
  'role_pages',
  'roles',
  'sessions',
  'tags',
  'team_members',
  'teams',
  'topics',
  'user_roles',
];

/** The sixteen tables 0024 re-granted SELECT to `anon`, and no others. */
const ANON_READABLE = [
  'article_categories',
  'article_tags',
  'articles',
  'competitions',
  'faq_entries',
  'media_assets',
  'media_usage',
  'mentor_profiles',
  'page_blocks',
  'pages',
  'programs',
  'redirects',
  'seo_meta',
  'tags',
  'testimonials',
  'topics',
];

async function main() {
  loadEnvLocal();
  const sql = postgres(required('DIRECT_URL'), { max: 1, connect_timeout: 15 });

  try {
    // ═══ 1. THE THREE THAT MUST NEVER APPEAR ═══════════════════════════
    section('1. TRUNCATE, TRIGGER and REFERENCES are held by nobody');

    for (const priv of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) {
      const held = await sql`
        SELECT grantee, table_name FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated')
          AND privilege_type = ${priv}
        ORDER BY grantee, table_name`;
      check(
        `no ${priv} on any table, for anon or authenticated`,
        held.length === 0,
        held.length
          ? `${held.length} grant(s), e.g. ${held[0].grantee} on ${held[0].table_name}`
          : '',
      );
    }

    // ═══ 2. THE PROPERTY, NOT THE PARAGRAPH ════════════════════════════
    section('2. …and TRUNCATE actually fails, on a table with data in it');

    /**
     * The catalog check above could pass while something else, a role
     * membership, a PUBLIC grant, hands the privilege back. This runs the
     * statement. The table is created for the test and carries an RLS policy
     * that denies every read, so the pre-0028 behaviour is unmistakable: SELECT
     * returns nothing and TRUNCATE empties it anyway.
     */
    await sql.unsafe(`
      DROP TABLE IF EXISTS public."${TAG}_probe";
      CREATE TABLE public."${TAG}_probe" (id serial primary key, secret text);
      INSERT INTO public."${TAG}_probe" (secret) VALUES ('a'), ('b'), ('c');
      ALTER TABLE public."${TAG}_probe" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY nobody ON public."${TAG}_probe" FOR SELECT USING (false);
    `);

    const asAuthenticated = async (stmt) => {
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe('SET LOCAL ROLE authenticated');
          await tx.unsafe(stmt);
        });
        return null;
      } catch (e) {
        return e.code ?? 'error';
      }
    };

    const truncErr = await asAuthenticated(`TRUNCATE public."${TAG}_probe"`);
    check('TRUNCATE raises insufficient_privilege', truncErr === '42501', String(truncErr));

    const [{ n }] =
      await sql`SELECT count(*)::int AS n FROM public."${sql.unsafe(`${TAG}_probe`)}"`;
    check('and the rows are still there', n === 3, `${n} rows`);

    const trigErr = await asAuthenticated(
      `CREATE TRIGGER t BEFORE INSERT ON public."${TAG}_probe" FOR EACH ROW EXECUTE FUNCTION app.current_user_id()`,
    );
    check('TRIGGER is refused too', trigErr === '42501', String(trigErr));

    // ═══ 3. NEW TABLES ═════════════════════════════════════════════════
    section('3. A table created tomorrow is not born over-granted');

    /**
     * The regression that matters. Nothing in the repository ever granted the
     * privilege, `ALTER DEFAULT PRIVILEGES` did, for every table anybody would
     * ever create. Asserting the 56 tables we have today would not have caught
     * the original defect and would not catch its return; asserting a table
     * that did not exist when this file was written does both.
     */
    await sql.unsafe(`CREATE TABLE public."${TAG}_newborn" (id int)`);
    const newborn = await sql`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = ${`${TAG}_newborn`}
        AND grantee IN ('anon', 'authenticated')
      ORDER BY grantee, privilege_type`;

    const newbornAnon = newborn.filter((r) => r.grantee === 'anon');
    const newbornAuth = newborn
      .filter((r) => r.grantee === 'authenticated')
      .map((r) => r.privilege_type);

    check(
      'anon inherits nothing at all',
      newbornAnon.length === 0,
      `${newbornAnon.length} grant(s)`,
    );
    check(
      'authenticated inherits no TRUNCATE, TRIGGER or REFERENCES',
      !newbornAuth.some((p) => ['TRUNCATE', 'TRIGGER', 'REFERENCES'].includes(p)),
      newbornAuth.join(','),
    );
    check(
      'but still inherits the read/write set the application needs',
      ['SELECT', 'INSERT', 'UPDATE'].every((p) => newbornAuth.includes(p)),
      newbornAuth.join(','),
    );

    // ═══ 4. DELETE ═════════════════════════════════════════════════════
    section('4. DELETE only where the application deletes');

    const deletes = await sql`
      SELECT table_name FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'DELETE'
        AND table_name NOT LIKE ${`${TAG}%`}
      ORDER BY table_name`;
    const held = deletes.map((r) => r.table_name);
    const unexpected = held.filter((t) => !DELETE_ALLOWED.includes(t));
    const missing = DELETE_ALLOWED.filter((t) => !held.includes(t));

    check(
      'no table holds DELETE without a delete path',
      unexpected.length === 0,
      unexpected.join(', '),
    );
    check('every table with a delete path holds it', missing.length === 0, missing.join(', '));

    /**
     * The financial and identity records specifically. Named rather than
     * derived, because "invoices cannot be deleted by a signed-in user" is a
     * claim worth stating in a form that survives someone rewriting the list.
     */
    for (const t of [
      'invoices',
      'payments',
      'students',
      'users',
      'audit_log',
      'assessments',
      'progress',
    ]) {
      check(`${t}: a signed-in user holds no DELETE`, !held.includes(t));
    }

    // ═══ 5. ANON ═══════════════════════════════════════════════════════
    section('5. anon reads sixteen tables and writes none');

    const anonGrants = await sql`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'anon'
        AND table_name NOT LIKE ${`${TAG}%`}
      ORDER BY table_name`;
    const anonWrites = anonGrants.filter((r) => r.privilege_type !== 'SELECT');
    const anonReads = anonGrants
      .filter((r) => r.privilege_type === 'SELECT')
      .map((r) => r.table_name);

    check(
      'anon holds no write privilege anywhere',
      anonWrites.length === 0,
      anonWrites.map((r) => `${r.privilege_type} ${r.table_name}`).join(', '),
    );
    check(
      'anon reads exactly the sixteen public tables',
      anonReads.length === ANON_READABLE.length &&
        ANON_READABLE.every((t) => anonReads.includes(t)),
      `${anonReads.length}: ${anonReads.join(', ')}`,
    );

    /**
     * The list is not arbitrary: it should be the tables that carry an `anon`
     * SELECT policy. A table granted to anon with no policy reads as nothing
     * and is dead weight; a table with a policy and no grant fails on the
     * marketing site. Both are defects, and this states which.
     */
    const policied = await sql`
      SELECT DISTINCT tablename FROM pg_policies
      WHERE schemaname = 'public' AND 'anon' = ANY(roles)
      ORDER BY tablename`;
    const policiedNames = policied.map((r) => r.tablename);
    check(
      'and the grant list matches the anon POLICY list exactly',
      policiedNames.length === anonReads.length &&
        policiedNames.every((t) => anonReads.includes(t)),
      `policies on ${policiedNames.length}, grants on ${anonReads.length}`,
    );

    // ═══ 6. RLS IS STILL THE OTHER GATE ════════════════════════════════
    section('6. Both gates, not one');

    const noRls = await sql`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
        AND c.relname NOT LIKE ${`${TAG}%`}`;
    check(
      'RLS is enabled on every table',
      noRls.length === 0,
      noRls.map((r) => r.relname).join(', '),
    );

    /**
     * A view runs with its definer's rights unless `security_invoker` is set,
     * so one view over `students` would undo every policy on it. There are none
     * today; this fails the moment somebody adds one without thinking about it.
     */
    const views = await sql`
      SELECT c.relname,
             COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                       WHERE option_name = 'security_invoker'), 'false') AS invoker
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v'`;
    const definerViews = views.filter((v) => v.invoker !== 'true' && v.invoker !== 'on');
    check(
      'no view bypasses RLS with definer rights',
      definerViews.length === 0,
      definerViews.map((v) => v.relname).join(', '),
    );

    // ═══ 7. THE APPLICATION STILL WORKS ════════════════════════════════
    section('7. Least privilege that still lets the product run');

    /**
     * A cleanup that breaks signed-in users is not a security improvement, so
     * the writes the product actually performs are exercised here as
     * `authenticated`, the same role, through the same RLS, and rolled back.
     * The 1,138 assertions in the other suites are the real proof; this is the
     * fast one that names the privilege if it goes missing.
     */
    const [head] = await sql`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id AND r.code = 'HEAD'
      LIMIT 1`;

    const asHead = async (stmt) => {
      if (!head) return 'no-head';
      class Rollback extends Error {}
      try {
        await sql
          .begin(async (tx) => {
            await tx.unsafe(
              `SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: head.id })}', true)`,
            );
            await tx.unsafe('SET LOCAL ROLE authenticated');
            await tx.unsafe(stmt);
            throw new Rollback();
          })
          .catch((e) => {
            if (!(e instanceof Rollback)) throw e;
          });
        return null;
      } catch (e) {
        return e.code ?? e.message;
      }
    };

    check(
      'a Head can still read students',
      (await asHead('SELECT id FROM students LIMIT 1')) === null,
    );
    check(
      'a Head can still read invoices',
      (await asHead('SELECT id FROM invoices LIMIT 1')) === null,
    );
    check(
      'a Head can still write an article draft',
      (await asHead(
        `UPDATE articles SET subtitle = 'grants probe' WHERE id IN (SELECT id FROM articles LIMIT 1)`,
      )) === null,
    );
    check(
      'a Head can still delete a tag. DELETE survived where it is used',
      (await asHead(`DELETE FROM tags WHERE id IN (SELECT id FROM tags LIMIT 1)`)) === null,
    );
    check(
      'a Head still cannot delete an invoice, no privilege to lose',
      (await asHead(`DELETE FROM invoices WHERE id IN (SELECT id FROM invoices LIMIT 1)`)) ===
        '42501',
    );
  } finally {
    await sql.unsafe(`DROP TABLE IF EXISTS public."${TAG}_probe"`).catch(() => {});
    await sql.unsafe(`DROP TABLE IF EXISTS public."${TAG}_newborn"`).catch(() => {});
    await sql.end();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
