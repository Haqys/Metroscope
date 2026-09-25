-- ═══════════════════════════════════════════════════════════════════════════
--  Identity and authorisation: users, roles, grants.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Every policy is DROP-then-CREATE so the whole directory can be re-applied on
-- each deploy and converge, the same way the seed does.

-- ── users ──────────────────────────────────────────────────────────────
/**
 * Three grounds, narrowest first.
 *
 * The third is the staff DIRECTORY, and it is deliberately not "staff can read
 * users". `/team` is granted to Secretary and Mentor (doc 13 §20) and was
 * unusable for them: with only self + `user.manage`, a Secretary opening the
 * team page saw one row, themselves. But widening it to every user row would
 * hand every mentor the guardian list, because parents are `users` too.
 *
 * So: colleagues are visible to colleagues, and CUSTOMERS stay behind
 * `user.manage`. Note that "is this account staff?" is NOT "does it have a
 * user_roles row", guardians hold PARENT. It is `app.is_staff_account()`,
 * which asks whether any of those roles is a non-customer one.
 */
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT TO authenticated
  USING (
    id = app.current_user_id()          -- always see yourself
    OR app.has_action('user.manage')    -- team administration: everyone
    OR (app.is_staff() AND app.is_staff_account(users.id))  -- the staff directory
  );

/**
 * Retire the previous name, now that nothing references it.
 *
 * It has to happen HERE rather than in 00_helpers.sql: this directory
 * re-applies on every deploy, and at the time helpers run, `users_select` still
 * points at the old function, so the drop fails with a dependency error. Doing
 * it after the policy is recreated means the dependency is already gone.
 * `CASCADE` would also "work", by dropping the policy.
 */
DROP FUNCTION IF EXISTS app.holds_any_role(uuid);

DROP POLICY IF EXISTS users_update_self ON users;
CREATE POLICY users_update_self ON users
  FOR UPDATE TO authenticated
  USING (id = app.current_user_id() OR app.has_action('user.manage'))
  WITH CHECK (id = app.current_user_id() OR app.has_action('user.manage'));

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('user.manage'));

-- No DELETE policy anywhere in this file. Deactivation is `status`, not a row
-- disappearing: deleting a user would cascade away their audit trail, which is
-- the one thing that must survive them.

-- ── roles ──────────────────────────────────────────────────────────────
-- Readable by any signed-in user: the nav has to resolve the caller's own
-- grants, and /settings/roles has to list roles to assign them. Role rows carry
-- no secrets, the sensitive part is who HOLDS them (user_roles, below).
DROP POLICY IF EXISTS roles_select ON roles;
CREATE POLICY roles_select ON roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS roles_write ON roles;
CREATE POLICY roles_write ON roles
  FOR ALL TO authenticated
  USING (app.has_action('role.manage'))
  WITH CHECK (app.has_action('role.manage'));

-- ── role_pages / role_actions ──────────────────────────────────────────
DROP POLICY IF EXISTS role_pages_select ON role_pages;
CREATE POLICY role_pages_select ON role_pages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS role_pages_write ON role_pages;
CREATE POLICY role_pages_write ON role_pages
  FOR ALL TO authenticated
  USING (app.has_action('role.manage'))
  WITH CHECK (app.has_action('role.manage'));

DROP POLICY IF EXISTS role_actions_select ON role_actions;
CREATE POLICY role_actions_select ON role_actions
  FOR SELECT TO authenticated
  USING (true);

/**
 * The self-escalation gate.
 *
 * Without `role.manage` on the WITH CHECK, any caller who could write
 * role_actions could grant themselves payment.verify and approve their own
 * refunds. This is the single most important WITH CHECK in the schema.
 */
DROP POLICY IF EXISTS role_actions_write ON role_actions;
CREATE POLICY role_actions_write ON role_actions
  FOR ALL TO authenticated
  USING (app.has_action('role.manage'))
  WITH CHECK (app.has_action('role.manage'));

-- ── user_roles ─────────────────────────────────────────────────────────
/**
 * Who holds which role.
 *
 * The last clause mirrors `users_select` above, and was missing: staff could
 * see a colleague in the directory but not what that colleague DOES. Every
 * `roles` array came back empty for everyone except the caller, silently, 
 * `/team`'s "Mentor" KPI read 0 for a Secretary since Task 0.4, its role chips
 * rendered blank, and §3.1's booking form offered an empty mentor picker to the
 * exact role doc 13 §8.3 puts in charge of scheduling.
 *
 * It is the right predicate, not a widening for convenience: if you may see the
 * person, you may see their job. `users_select` already keeps guardians out of
 * the staff directory entirely, so this exposes nothing to a customer, and
 * `app.is_staff_account()` keeps a staff member from reading which guardians
 * hold PARENT, which is a different question and none of their business.
 */
DROP POLICY IF EXISTS user_roles_select ON user_roles;
CREATE POLICY user_roles_select ON user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = app.current_user_id()
    OR app.has_action('user.manage')
    OR app.has_action('role.manage')
    OR (app.is_staff() AND app.is_staff_account(user_id))
  );

DROP POLICY IF EXISTS user_roles_write ON user_roles;
CREATE POLICY user_roles_write ON user_roles
  FOR ALL TO authenticated
  USING (app.has_action('role.manage'))
  WITH CHECK (app.has_action('role.manage'));
