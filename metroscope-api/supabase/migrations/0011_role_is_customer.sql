-- ═══════════════════════════════════════════════════════════════════════════
--  Separate CUSTOMER roles from STAFF roles.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `app.is_staff()` was defined as "holds any role at all", documented with the
-- premise that customers have a users row and a students row but no user_roles
-- entry. That premise stopped being true when conversion started assigning the
-- PARENT role (modules/enrollment/enrollment.repo.ts), so every guardian in
-- the system was staff as far as RLS was concerned.
--
-- Measured, not assumed: a guardian created exactly the way `convertLead`
-- creates one returned `is_staff() = true` and could SELECT unpublished
-- programmes. `activity_event` and `topics`, which are also gated on
-- `is_staff()`, would have been readable across families the moment those
-- tables held rows.
--
-- The fix keeps roles as data rather than hardcoding a code into a policy: a
-- role declares which population it belongs to, and `is_staff()` asks that.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN roles.is_customer IS
  'This role belongs to the CUSTOMER population (guardians), not the team. '
  'Customer roles never make app.is_staff() true and are never assignable from '
  '/team. Kept as a column rather than a code check so a future customer role '
  'needs no policy change.';

UPDATE roles SET is_customer = true WHERE code = 'PARENT';

-- Every staff policy funnels through app.is_staff(), and a partial index on the
-- flag keeps the membership lookup cheap for the common (staff) case.
CREATE INDEX IF NOT EXISTS roles_customer_idx ON roles (is_customer);
