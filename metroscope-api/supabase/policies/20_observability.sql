-- ═══════════════════════════════════════════════════════════════════════════
--  Observability: audit_log, activity_event.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── audit_log ──────────────────────────────────────────────────────────
--
-- Append-only, and not even appendable from here: writeAuditLog() runs on the
-- owner connection (lib/audit.ts), so it bypasses RLS entirely. That is
-- deliberate, an audit record must be written even when the action that
-- triggered it was denied, and especially then.
--
-- No INSERT, UPDATE or DELETE policy exists. `authenticated` therefore cannot
-- forge, amend or erase an audit entry even with a valid session, which is the
-- property that makes the log worth keeping.
DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT TO authenticated
  USING (app.has_action('role.manage'));

-- ── activity_event ─────────────────────────────────────────────────────
-- The human-readable feed on a record's timeline. Staff see it; a parent sees
-- only events on their own student.
DROP POLICY IF EXISTS activity_event_select ON activity_event;
CREATE POLICY activity_event_select ON activity_event
  FOR SELECT TO authenticated
  USING (
    app.is_staff()
    OR (entity_type = 'student' AND app.owns_student(app.safe_uuid(entity_id)))
  );
