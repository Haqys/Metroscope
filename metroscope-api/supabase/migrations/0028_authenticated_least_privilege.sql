-- ═══════════════════════════════════════════════════════════════════════════
--  `authenticated` had TRUNCATE on 51 tables, and RLS does not gate TRUNCATE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 0024 closed this for `anon` and deliberately left `authenticated` open,
-- because revoking it blindly would have broken signed-in pages and it deserved
-- its own change with its own test. This is that change.
--
-- The inventory (`node scripts/grant-inventory.mjs`, read from the catalog and
-- not from these files) says every signed-in user holds `arwdDxtm`. SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, on 51 of 56 tables,
-- including `students`, `invoices`, `payments`, `users` and `audit_log`.
--
-- **TRUNCATE is the one that is not merely untidy.** Row-level security filters
-- SELECT, INSERT, UPDATE and DELETE. It does not apply to TRUNCATE at all, so a
-- policy is not a second gate there. It is no gate. Proven, not assumed: a
-- scratch table with RLS enabled and `USING (false)` was emptied by
-- `SET ROLE authenticated; TRUNCATE ...` while SELECT returned nothing.
--
--   rows before: 3 · SELECT → 0 rows · DELETE → 0 rows · TRUNCATE → rows after: 0
--
-- No incident is implied and none is reachable through PostgREST, which offers
-- no TRUNCATE verb, and `authenticated` is NOLOGIN so nobody connects as it
-- directly. It is a latent privilege, not a live exploit. But it is precisely
-- the privilege whose blast radius is "the table is gone", held by every parent
-- with a password, guarded by the absence of a feature in a component this
-- repository does not control.
--
-- Three privileges are revoked outright because no application path uses any of
-- them and each is pure attack surface:
--
--   TRUNCATE, ungated by RLS, destroys a table's contents in one statement.
--   TRIGGER, lets a caller attach code to a table they do not own.
--   REFERENCES, lets a caller build an FK against a table they cannot read,
--                which leaks the existence of values through constraint checks.
--
-- SELECT, INSERT and UPDATE are left in place and stay gated by RLS. They are
-- what the application actually does, on every table, through `asUser()`.

/**
 * New tables must not be born with them.
 *
 * 0024 removed `anon` from the `postgres` default ACL entirely; this narrows
 * `authenticated` rather than removing it, because every table this repo
 * creates does need the signed-in role to be able to read and write it subject
 * to policy. `supabase_admin` is attempted and skipped exactly as 0024 does, 
 * on a hosted project the migration role is usually not a member, and it
 * governs platform tables rather than ours.
 */
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;

DO $$ BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipped supabase_admin default ACL, migration role is not a member';
END $$;

/** Then take back what was already handed out. `anon` is included for the
 *  tables 0024 re-granted SELECT on: it holds none of these three today, and
 *  saying so here means a future GRANT SELECT cannot quietly carry them back. */
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

/**
 * ── DELETE: kept only where the application deletes ──
 *
 * RLS *does* gate DELETE, but it gates it by matching zero rows rather than by
 * raising, §3.5 found that the hard way, asserting "nobody can delete an
 * assessment" and getting no error. A missing or over-broad DELETE policy is
 * therefore silent data loss, which makes the grant worth withdrawing wherever
 * nothing needs it.
 *
 * The keep-list below is not a judgement call either: it is every table named
 * in a `DELETE FROM` in `modules/`, `app/` and `lib/`. The CMS pipeline is
 * absent on purpose, content is archived and unpublished, never row-deleted,
 * so `faq_entries`, `testimonials`, `mentor_profiles` and `competitions` have
 * no delete path despite being editable. `pages` and `articles` do, through
 * their own services.
 *
 * Cascades are unaffected: a referential action runs with the privileges of the
 * referenced table's owner, so deleting an article still clears `article_tags`
 * and `media_usage` whether or not the caller holds DELETE on them.
 */
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

GRANT DELETE ON
  article_categories,
  article_tags,
  articles,
  assessment_claims,
  competition_targets,
  material_assignments,
  material_resources,
  media_assets,
  media_usage,
  mentor_availability,
  page_blocks,
  pages,
  programs,
  role_actions,
  role_pages,
  roles,
  sessions,
  tags,
  team_members,
  teams,
  topics,
  user_roles
TO authenticated;
