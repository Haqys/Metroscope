-- ═══════════════════════════════════════════════════════════════════════════
--  `anon` had INSERT, UPDATE and DELETE on every table. (doc 04 §0.3, doc 08 §5)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Found while asserting the opposite in §3.4's suite: the test claimed "anon
-- holds no grant on participants, teams or members" and failed, because anon
-- held `arwdDxtm`, the full set, on those tables and on every other table in
-- `public`, including `students`, `invoices` and `payments`.
--
-- Nothing in this codebase granted it. Supabase ships a default ACL:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, ...
--
-- so every table any migration has ever created was born with it. That is why
-- the careful per-table `GRANT SELECT, INSERT, UPDATE ON x TO authenticated`
-- lines throughout 0001–0023 never appeared to be missing anything: the default
-- had already granted more than they ask for, to more roles.
--
-- **What was actually protecting the data is RLS, alone.** Every table has it
-- enabled and `anon` has SELECT policies on exactly sixteen, so nothing was
-- reachable in practice, and no incident is implied. But doc 04 §0.3 makes RLS
-- one of two gates, not the only one; a table shipped with RLS enabled and no
-- policy is a table anon can read nothing from, whereas a table that ever loses
-- a policy, or gains a permissive one written for `authenticated` and applied
-- `TO public` by mistake, becomes writable by the internet. Defence in depth
-- means the second gate has to be closed too, and it was wide open.
--
-- `authenticated` carries the same over-grant and is deliberately NOT touched
-- here. Revoking it would make every table depend on a per-table GRANT that the
-- older migrations may not have written, and the failure mode is a signed-in
-- parent getting a permission error on a page that worked yesterday. It is a
-- real second finding, it is recorded in doc 14, and it wants its own change
-- with its own test, not a side effect of the competitions task.

/**
 * Stop the bleeding first: new tables must not inherit the grant.
 *
 * Two owners create tables in this database, `postgres` (migrations) and
 * `supabase_admin` (the platform). Both default ACLs grant to `anon`. The
 * second may not be alterable by the migration role on hosted projects, so it
 * is attempted and skipped rather than allowed to fail the deploy; the
 * `postgres` one is the one that governs everything this repo creates.
 */
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

DO $$ BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipped supabase_admin default ACL, migration role is not a member';
END $$;

/** Then take back what was already handed out. */
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

/**
 * And grant back exactly what the anon POLICIES already allow. SELECT on the
 * sixteen tables that carry a `*_select_public` policy, and nothing else.
 *
 * This list is not a judgement call: it is `SELECT tablename FROM pg_policies
 * WHERE 'anon' = ANY(roles)`. Every public read in the API runs through
 * `asAnon`, so anything missing here fails loudly on the marketing site rather
 * than silently returning less. Public WRITES, the registration form and the
 * contact form, never ran as `anon` at all; they go through
 * `withElevatedPrivileges`, which is why revoking INSERT costs nothing.
 */
GRANT SELECT ON
  programs,
  topics,
  articles,
  article_categories,
  article_tags,
  tags,
  pages,
  page_blocks,
  faq_entries,
  testimonials,
  mentor_profiles,
  media_assets,
  media_usage,
  redirects,
  seo_meta,
  competitions
TO anon;
