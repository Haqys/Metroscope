-- ═══════════════════════════════════════════════════════════════════════════
--  Lead funnel: registrations, registration_contacts.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Leads are commercially sensitive: names of minors, phone numbers, and the
-- reasons prospects were lost. Nothing here is readable without the /leads page
-- grant, and `anon` has no access at all.
--
-- Public submissions do NOT insert through this policy. They arrive at
-- POST /v1/public/registrations, which runs under withElevatedPrivileges()
-- ('user.provision') precisely because the submitter has no session to
-- authorise. Leaving anon INSERT closed means the only way to create a lead is
-- through that endpoint's validation, honeypot and rate limit.

DROP POLICY IF EXISTS registrations_select ON registrations;
CREATE POLICY registrations_select ON registrations
  FOR SELECT TO authenticated
  USING (app.has_page('/leads'));

/**
 * Working a lead, recording a call, setting a follow-up date, moving it
 * through the pipeline, is the Secretary's day job and needs lead.approve.
 *
 * `lead.reject` alone deliberately does NOT grant UPDATE: a role that can only
 * reject should not be able to quietly edit a lead's details first.
 */
DROP POLICY IF EXISTS registrations_update ON registrations;
CREATE POLICY registrations_update ON registrations
  FOR UPDATE TO authenticated
  USING (app.has_action('lead.approve'))
  WITH CHECK (app.has_action('lead.approve'));

DROP POLICY IF EXISTS registrations_insert ON registrations;
CREATE POLICY registrations_insert ON registrations
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('lead.approve'));

-- No DELETE: leads are CRM assets and are never hard-deleted (doc 09 §3).
-- A dead lead is status = LOST with a loss_reason, which is data worth keeping.

-- ── registration_contacts ──────────────────────────────────────────────
DROP POLICY IF EXISTS registration_contacts_select ON registration_contacts;
CREATE POLICY registration_contacts_select ON registration_contacts
  FOR SELECT TO authenticated
  USING (app.has_page('/leads'));

/**
 * A contact note may only be filed under the caller's own name. Without the
 * actor_id check in WITH CHECK, one staff member could file notes as another, 
 * and the contact log is what the follow-up queue and any later dispute rely on.
 */
DROP POLICY IF EXISTS registration_contacts_insert ON registration_contacts;
CREATE POLICY registration_contacts_insert ON registration_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_page('/leads')
    AND actor_id = app.current_user_id()
  );

-- Append-only: no UPDATE, no DELETE. Rewriting history in a contact log defeats
-- its purpose.
