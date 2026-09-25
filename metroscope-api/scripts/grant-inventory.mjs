import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What `anon` and `authenticated` can actually do, from the catalog.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/grant-inventory.mjs
 *
 * Read-only. Reports table privileges, RLS state and policy counts for every
 * table in `public`, so the privilege model can be reasoned about from what
 * the database says rather than from what the migrations were supposed to do.
 *
 * The distinction that matters (doc 04 §5): a GRANT is a *capability*, a policy
 * is an *authorisation*. Supabase ships every new table with ALL granted to
 * both roles, so without an explicit REVOKE the only thing standing between a
 * signed-in parent and every row in the database is whether somebody remembered
 * to write a policy. That is one mistake deep.
 */
loadEnvLocal();
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const rows = await sql`
  WITH t AS (
    SELECT c.oid, c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  )
  SELECT t.table_name,
         t.rls,
         t.forced,
         (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = t.oid) AS policies,
         COALESCE((
           SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
           FROM information_schema.role_table_grants g
           WHERE g.table_schema = 'public' AND g.table_name = t.table_name AND g.grantee = 'anon'
         ), '') AS anon,
         COALESCE((
           SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
           FROM information_schema.role_table_grants g
           WHERE g.table_schema = 'public' AND g.table_name = t.table_name AND g.grantee = 'authenticated'
         ), '') AS auth
  FROM t
  ORDER BY t.table_name`;

const short = (s) =>
  s
    .split(',')
    .filter(Boolean)
    .map(
      (p) =>
        ({
          SELECT: 'r',
          INSERT: 'a',
          UPDATE: 'w',
          DELETE: 'd',
          TRUNCATE: 'D',
          REFERENCES: 'x',
          TRIGGER: 't',
        })[p] ?? p,
    )
    .join('');

console.log(`\n${rows.length} tables in public\n`);
console.log(
  'table'.padEnd(32),
  'RLS'.padEnd(4),
  'pol'.padEnd(4),
  'anon'.padEnd(8),
  'authenticated',
);
console.log('─'.repeat(88));
for (const r of rows) {
  console.log(
    r.table_name.padEnd(32),
    (r.rls ? 'on' : 'OFF').padEnd(4),
    String(r.policies).padEnd(4),
    short(r.anon).padEnd(8),
    short(r.auth),
  );
}

const writable = rows.filter((r) => /a|w|d/.test(short(r.auth)));
const anonAny = rows.filter((r) => short(r.anon) !== '');
const noRls = rows.filter((r) => !r.rls);
const noPolicy = rows.filter((r) => r.rls && r.policies === 0);

console.log('\n── summary ──');
console.log('r=SELECT a=INSERT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER');
console.log(`authenticated holds a write privilege on : ${writable.length}/${rows.length} tables`);
console.log(`anon holds any privilege on              : ${anonAny.length}/${rows.length} tables`);
console.log(
  `RLS off                                  : ${noRls.length}, ${noRls.map((r) => r.table_name).join(', ') || 'none'}`,
);
console.log(
  `RLS on but zero policies (deny-all)      : ${noPolicy.length}, ${noPolicy.map((r) => r.table_name).join(', ') || 'none'}`,
);

// Default privileges, the reason new tables inherit the problem.
const defs = await sql`
  SELECT pg_get_userbyid(d.defaclrole) AS owner, d.defaclobjtype AS objtype,
         array_to_string(d.defaclacl, ' ') AS acl
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'`;
console.log('\n── default privileges on public ──');
for (const d of defs) console.log(` ${d.owner} ${d.objtype}: ${d.acl}`);
if (defs.length === 0) console.log(' (none)');

// SECURITY DEFINER functions: they run as their owner, so they are the one
// legitimate way past RLS and must each be there on purpose.
const fns = await sql`
  SELECT n.nspname AS schema, p.proname AS name, pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef AND n.nspname IN ('public', 'app')
  ORDER BY n.nspname, p.proname`;
console.log(`\n── SECURITY DEFINER functions (${fns.length}) ──`);
for (const f of fns) console.log(` ${f.schema}.${f.name} (owner ${f.owner})`);

// Views run with the definer's rights unless security_invoker is set, so a
// view over a protected table is a hole that no policy on that table closes.
const views = await sql`
  SELECT c.relname AS name,
         COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                   WHERE option_name = 'security_invoker'), 'false') AS invoker
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
  ORDER BY c.relname`;
console.log(`\n── views (${views.length}) ──`);
for (const v of views) console.log(` ${v.name} security_invoker=${v.invoker}`);
if (views.length === 0) console.log(' (none)');

await sql.end();
