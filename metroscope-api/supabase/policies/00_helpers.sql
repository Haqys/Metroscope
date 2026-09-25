-- ═══════════════════════════════════════════════════════════════════════════
--  RLS helper functions, the vocabulary every policy is written in.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Grants live in role_actions / role_pages, which `authenticated` may only read
-- in limited ways. These helpers therefore run SECURITY DEFINER so a policy can
-- ask "does the caller hold payment.verify?" without the caller being able to
-- read the grant tables directly.
--
-- Three properties matter and all three are load-bearing:
--
--   SECURITY DEFINER  runs as the owner, so it can see the grant tables.
--   SET search_path   pinned. Without it a caller could create a `public.roles`
--                     earlier in their own search_path and answer their own
--                     authorisation question. This is the classic SECURITY
--                     DEFINER escalation and the pin is what prevents it.
--   STABLE            lets the planner call it once per statement instead of
--                     once per row, which is the difference between a usable
--                     policy and a table scan with 10k function calls.
--
-- The claims come from `set_config('request.jwt.claims', …, true)` in
-- lib/db/rls.ts. We read them directly rather than via Supabase's auth.uid()
-- so the policies are testable without GoTrue and behave identically locally.

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO authenticated, anon;

-- ── identity ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

COMMENT ON FUNCTION app.current_user_id() IS
  'Caller''s user id from the forwarded JWT claims. NULL for anon.';

-- ── grants ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.has_action(want text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_actions ra ON ra.role_id = ur.role_id
    WHERE ur.user_id = app.current_user_id()
      AND ra.action  = want
  )
$$;

COMMENT ON FUNCTION app.has_action(text) IS
  'Does the caller hold this action verb? Resolved from the database, not the '
  'token, so revoking a grant takes effect immediately rather than at token expiry.';

CREATE OR REPLACE FUNCTION app.has_page(want text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_pages rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = app.current_user_id()
      AND rp.href    = want
  )
$$;

COMMENT ON FUNCTION app.has_page(text) IS
  'Does the caller hold this page grant? Page grants gate READS; action verbs '
  'gate WRITES. Seeing the verification queue is not permission to approve it.';

CREATE OR REPLACE FUNCTION app.has_role(want text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = app.current_user_id()
      AND r.code     = want
  )
$$;

/**
 * Staff = holds at least one NON-CUSTOMER role.
 *
 * This used to be "holds any role at all", on the premise that customers have
 * a users row and a students row but no `user_roles` entry. That premise was
 * false: `convertLead` assigns the PARENT role to every guardian it creates, so
 * every customer in the system satisfied it. Proven, not theorised, a guardian
 * built the way conversion builds one returned `is_staff() = true` and could
 * SELECT unpublished programmes.
 *
 * Every staff-only policy in this directory funnels through here
 * (`programs`, `topics`, `activity_event`, `notification_templates`, the team
 * directory), which is what made one wrong predicate reach so far.
 *
 * `roles.is_customer` keeps the distinction as data, so adding a second
 * customer role later needs no policy change, see 0011_role_is_customer.sql.
 */
CREATE OR REPLACE FUNCTION app.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = app.current_user_id()
      AND NOT r.is_customer
  )
$$;

COMMENT ON FUNCTION app.is_staff() IS
  'Does the caller hold a non-customer role? Guardians hold PARENT, so "has any '
  'role" is NOT the same question.';

/**
 * Is this OTHER account a colleague. I.e. does it hold a non-customer role?
 *
 * SECURITY DEFINER for the same reason every helper above is, and it is worth
 * spelling out because getting this wrong is silent. A policy body runs as the
 * caller, so a bare `EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id)`
 * inside `users_select` is itself filtered by `user_roles_select`, which only
 * exposes the caller's OWN rows. The subquery then returns false for everybody
 * else and the staff directory shows exactly one person: you.
 *
 * Owner rights make the membership question answerable without widening what
 * the caller may read directly. It leaks one bit, "this account is staff", 
 * to another staff member, which is what a directory is.
 */
CREATE OR REPLACE FUNCTION app.is_staff_account(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = target
      AND NOT r.is_customer
  )
$$;

COMMENT ON FUNCTION app.is_staff_account(uuid) IS
  'Is the TARGET account staff? Owner rights, because a policy body cannot read '
  'another user''s user_roles rows through user_roles_select. Same predicate as '
  'app.is_staff(), asked about somebody else.';

-- ── ownership ──────────────────────────────────────────────────────────

/**
 * The caller owns this student record.
 *
 * One account per family: students.user_id is the parent's account (doc 09, 
 * "ortu login & bayar"). This single predicate is what keeps one family's
 * invoices, progress and schedule invisible to another.
 */
CREATE OR REPLACE FUNCTION app.owns_student(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM students s
    WHERE s.id      = student
      AND s.user_id = app.current_user_id()
  )
$$;

/**
 * The display name to print under a PUBLISHED article's headline.
 *
 * The public site is read by `anon`, and `users` is closed to `anon` for good
 * reason. It holds guardian emails and phone numbers. So the article listing's
 * `LEFT JOIN users` returned NULL for every byline, and the pages rendered with
 * no author at all: not an error anywhere, just a missing name, which is the
 * kind of defect that ships.
 *
 * Owner rights, but deliberately the narrowest possible widening:
 *
 *   · ONE column. `full_name`, never the row, so no email or phone can follow
 *     the name out even by mistake at a call site.
 *   · Only when that person authored something PUBLISHED. An account with no
 *     published article, every guardian, every mentor, returns NULL, so this
 *     cannot be used to enumerate the user table.
 *
 * A byline is public information by editorial decision; doc 13 §10.5 wants a
 * real one for E-E-A-T. This exposes exactly that and nothing adjacent.
 */
CREATE OR REPLACE FUNCTION app.published_author_name(target uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.full_name
  FROM users u
  WHERE u.id = target
    AND EXISTS (
      SELECT 1 FROM articles a
      WHERE a.author_id = target AND a.status = 'PUBLISHED'
    )
$$;

COMMENT ON FUNCTION app.published_author_name(uuid) IS
  'Byline for a published article. One column, and only for accounts that have '
  'published, so it cannot enumerate users or leak contact details to anon.';

/**
 * Exception-safe uuid cast.
 *
 * activity_event.entity_id is text because it points at many tables, not all of
 * which key on uuid. A bare `entity_id::uuid` inside a policy would raise
 * invalid_text_representation and fail the ENTIRE query the moment one row held
 * a non-uuid id, and it is not safe to assume the planner evaluates the
 * `entity_type = 'student'` guard first, since AND is not short-circuiting in
 * SQL. Casting inside a function argument is, so this is the reliable form.
 */
CREATE OR REPLACE FUNCTION app.safe_uuid(value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION
  app.current_user_id(),
  app.has_action(text),
  app.has_page(text),
  app.has_role(text),
  app.is_staff_account(uuid),
  app.is_staff(),
  app.owns_student(uuid),
  app.published_author_name(uuid),
  app.safe_uuid(text)
TO authenticated, anon;

/**
 * The mentor's name on a session a guardian may see.
 *
 * `users` is closed to guardians, `users_select` gives them only their own row,
 * so `LEFT JOIN users` on the session query returns NULL for a parent and the
 * name silently vanishes. §2.4 met exactly this with article bylines: nothing
 * errors, the column is simply blank, and the page looks finished.
 *
 * Same remedy, same shape. One column, and only for a session the caller can
 * already read: the `EXISTS` runs as the definer but is keyed to
 * `app.owns_student()`, so a guardian can resolve the mentor of their own
 * child's lesson and of nothing else. It cannot enumerate the user table and it
 * returns no contact detail.
 *
 * A parent knowing who teaches their child is the wireframe's own promise
 * ("Mentor: Kak Dinda"), and strictly less exposure than `/mentors` already
 * gives the open internet.
 */
CREATE OR REPLACE FUNCTION app.session_mentor_name(session_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.full_name
  FROM sessions s
  JOIN users u ON u.id = s.mentor_id
  WHERE s.id = session_id
    AND (
      app.owns_student(s.student_id)
      OR s.mentor_id = app.current_user_id()
      OR app.has_page('/schedule')
    )
$$;

COMMENT ON FUNCTION app.session_mentor_name(uuid) IS
  'Mentor display name for a session the caller may already read. One column, '
  'scoped by the same predicate as sessions_select, so it leaks nothing new.';
