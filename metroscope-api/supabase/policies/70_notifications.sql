-- ═══════════════════════════════════════════════════════════════════════════
--  Notifications: templates, deliveries, preferences.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── notification_templates ─────────────────────────────────────────────
-- Copy, not content: staff read them, settings.edit changes them.
DROP POLICY IF EXISTS notification_templates_select ON notification_templates;
CREATE POLICY notification_templates_select ON notification_templates
  FOR SELECT TO authenticated
  USING (app.is_staff());

DROP POLICY IF EXISTS notification_templates_write ON notification_templates;
CREATE POLICY notification_templates_write ON notification_templates
  FOR ALL TO authenticated
  USING (app.has_action('settings.edit'))
  WITH CHECK (app.has_action('settings.edit'));

-- ── notifications ──────────────────────────────────────────────────────
-- Strictly the recipient's own. There is no staff override: a notification is
-- addressed to one person, and reading someone else's is not an ops need.
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (user_id = app.current_user_id());

/**
 * The recipient may mark their own notification read. Rows are created by the
 * outbox dispatcher on the owner connection, so no INSERT policy is needed, 
 * and its absence means a session cannot fabricate a notification that appears
 * to come from Metroscope.
 */
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

-- ── notification_preferences ───────────────────────────────────────────
DROP POLICY IF EXISTS notification_preferences_all ON notification_preferences;
CREATE POLICY notification_preferences_all ON notification_preferences
  FOR ALL TO authenticated
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

-- ═══════════════════════════════════════════════════════════════════════
--  Deliberately policy-free: outbox_message, idempotency_key.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Both are machinery, not data anyone owns. RLS is enabled and no policy grants
-- anything, so `authenticated` and `anon` see nothing and can write nothing.
-- Only the owner connection, jobs and the dispatcher, touches them.
--
-- idempotency_key in particular must stay unreachable: being able to read or
-- delete a key would let a caller replay a payment that was already applied.
