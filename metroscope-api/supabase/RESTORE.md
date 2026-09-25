# Restoring Metroscope

Executed and verified **2026-08-11**. Every prerequisite below is one the drill
actually hit, none of it is precautionary.

`/api/jobs/backup-verify` proves the live database is healthy. It says out loud
that it does **not** prove a restore. This is the procedure that does, and
`npm run drill:restore` is the part that decides whether what came back is the
same database or merely a database.

## Why row counts are not the test

A restore can return every row and lose every policy and every grant. The result
looks perfect on any check that counts things, and is a breach with good uptime:
the data is all there and nothing is stopping anyone reading it.

The drill compares **policies (132), grants (206), functions (212), triggers (5)
and constraints (209)** against the live source, then signs in as a guardian and
checks they still cannot see another family.

## Prerequisites in the target

A plain PostgreSQL 17.6 is not enough. In order:

```bash
# 1. Roles. The dump's GRANT statements name them; without them every grant
#    fails and the restore reports success with no authorisation model at all.
psql -c "CREATE ROLE anon NOLOGIN"
psql -c "CREATE ROLE authenticated NOLOGIN"
psql -c "CREATE ROLE service_role NOLOGIN"
psql -c "CREATE ROLE supabase_admin NOLOGIN"

# 2. The database.
psql -c "CREATE DATABASE metroscope_restored"

# 3. Extensions, in the schemas production keeps them in. `btree_gist` is what
#    the scheduling exclusion constraint is built on, without it the session
#    conflict detection silently fails to restore.
psql -d metroscope_restored -c "CREATE SCHEMA IF NOT EXISTS extensions"
psql -d metroscope_restored -c "CREATE EXTENSION btree_gist"
psql -d metroscope_restored -c "CREATE EXTENSION pgcrypto SCHEMA extensions"
psql -d metroscope_restored -c 'CREATE EXTENSION "uuid-ossp" SCHEMA extensions'
```

## Taking the dump

```bash
pg_dump --dbname="$DIRECT_URL" --schema=public --schema=app \
        --no-owner --quote-all-identifiers --file=metroscope.sql
```

⚠️ **Never add `--no-privileges`.** The first drill run used it and produced a
restore that passed every schema and data check while missing all 206 grants,
the exact failure this document opens with. `--no-owner` is fine and necessary:
the target has no `postgres.<project-ref>` role.

## Restoring

```bash
psql -d metroscope_restored -v ON_ERROR_STOP=0 -f metroscope.sql
```

`schema "public" already exists` is the one expected error. Anything else is
real.

⚠️ **`psql` exits 0 even when statements fail.** Grep the output for `ERROR:`
rather than trusting the exit code, and grep case-insensitively, because
`psql: error: <file> not found` is lowercase and does not match `^ERROR`. A
drill run that never opened the file reported a clean restore for exactly this
reason.

## Verifying

Put the target's connection string in the environment rather than on the command
line, `guard-secrets.mjs` refuses a Postgres URL with a password in a tracked
file, and it is right to: a drill target's credentials age into a real one.

```bash
export PGPASSWORD='the-drill-target-password'
npm run drill:restore -- "postgresql://postgres@localhost:5434/metroscope_restored"
```

Read-only against the source. 33 checks; anything other than
`RESTORE VERIFIED` means the copy is not usable.

## Recorded result, 2026-08-11

|              |                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Source       | `aws-0-ap-southeast-1.pooler.supabase.com` · PostgreSQL 17.6 · Singapore                                        |
| Target       | isolated container on `localhost:5434` · PostgreSQL 17.6 · **never production**                                 |
| Dump         | 16s · 0.44 MB · 155 GRANT statements                                                                            |
| Restore      | 1s · one expected error                                                                                         |
| Verification | 3.8s · 33 checks · 0 failures                                                                                   |
| Scope        | 56 tables · 1,215 rows · 132 policies · 206 grants · 212 functions · 5 triggers · 209 constraints · 167 indexes |
| Result       | **RESTORE VERIFIED**                                                                                            |

Two discrepancies were investigated and both were the drill being wrong rather
than the restore:

- `media_focal_range` read as missing because `pg_get_constraintdef` re-parses
  on restore and prints `(a AND b AND (c AND d))` where the source printed
  `((a AND b) AND (c AND d))`. Same predicate. Constraint definitions are now
  compared with parentheses and whitespace stripped.
- "a guardian can read another family" was `demo-sec@example.test`, a Secretary
  who appears in the `users ⋈ students` join and is supposed to see everyone.
  The drill now picks an account holding no role other than `PARENT`.

## What this drill still does not prove

- **The managed backup file itself.** This dumps the live database; it does not
  restore Supabase's own snapshot. That needs the Management API and a personal
  access token.
- **The nightly external export.** doc 08 §3.2 requires an export to storage the
  team controls, on the grounds that a managed backup is the vendor's and an
  export you hold is yours. **It is not implemented**: there is no
  `.github/workflows/` directory in this repository at all.
- **Recovery time at production scale.** 1,215 rows restore in one second. That
  number says nothing about a database with three years of sessions in it.
