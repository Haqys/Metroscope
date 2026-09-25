-- ═══════════════════════════════════════════════════════════════════════════
--  Deny by default: enable RLS on every table.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Supabase grants ALL on public tables to `anon` and `authenticated` by default.
-- With RLS off that combination means the anon key -- which is public by design
-- and ships inside browser bundles -- can SELECT, INSERT, UPDATE and DELETE
-- every row in every table through PostgREST. Verified against this project on
-- 2026-07-30: an anonymous INSERT into `programs` returned 201.
--
-- Enabling RLS with NO policies denies all four verbs to `anon` and
-- `authenticated`. It deliberately leaves the service running:
--
--   * `withElevatedPrivileges()` performs no role switch, so it keeps the pooled
--     connection's `postgres` role. That role owns these tables and owners are
--     exempt from RLS, so the public registration endpoint is unaffected.
--   * `asUser()` / `asAnon()` switch to `authenticated` / `anon` and will be
--     denied until doc 14 section 0.2 adds per-table policies. No shipped
--     endpoint reaches either path yet -- both need auth, which is section 0.3.
--
-- So this migration closes the hole without changing any current behaviour, and
-- section 0.2 opens access back up deliberately, one policy at a time.
--
-- NOTE: policies are additive. Every table below stays fully closed to end users
-- until a policy grants something, which is the intended starting point.

ALTER TABLE "users"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_pages"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_actions"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_event"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_message"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_key"           ENABLE ROW LEVEL SECURITY;

ALTER TABLE "programs"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "topics"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registrations"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registration_contacts"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_templates"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences"  ENABLE ROW LEVEL SECURITY;
