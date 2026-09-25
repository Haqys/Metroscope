-- ═══════════════════════════════════════════════════════════════════════════
--  Calendar sync needs a state, not just an id. (doc 03 §6.2, doc 07 §6)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `sessions.gcal_event_id` and `sessions.meet_url` have existed since 0001 and
-- nothing has ever written to them: doc 06 §2.3 declared the columns, doc 07 §6
-- drew the worker, and the worker was never built. `meet_url` was reachable
-- only by a human typing a link into the update form.
--
-- Four columns are added rather than a separate integration table, because
-- doc 06 already puts the event id on the session and a one-to-one table would
-- be the same row with a join in front of it.
--
--   gcal_calendar_id  WHICH calendar the event lives on. Without it, changing
--                     GOOGLE_CALENDAR_ID orphans every existing event, the id
--                     is only meaningful against the calendar that issued it.
--   gcal_sync_status  PENDING / SYNCED / FAILED / DISABLED. doc 03 §7 requires
--                     sync failures to be "retried and surfaced"; you cannot
--                     surface what you did not record.
--   gcal_synced_at    when the calendar last agreed with us.
--   gcal_sync_error   the error CATEGORY, never the provider's raw response, 
--                     that can carry account detail, and this column is read
--                     by staff UI.
--
-- ⚠️ No credential is stored here. The service-account key lives in the
-- environment and nowhere else (§4).

CREATE TYPE calendar_sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'DISABLED');

ALTER TABLE sessions
  ADD COLUMN gcal_calendar_id text,
  ADD COLUMN gcal_sync_status calendar_sync_status,
  ADD COLUMN gcal_synced_at   timestamptz,
  ADD COLUMN gcal_sync_error  text;

/**
 * An event id is meaningless without the calendar it belongs to, and a synced
 * session must know when it was synced. Stating that as a constraint keeps the
 * worker honest: a partial write fails loudly instead of leaving a row that
 * claims to be synced and cannot be found again.
 */
ALTER TABLE sessions
  ADD CONSTRAINT sessions_gcal_event_needs_calendar
  CHECK (gcal_event_id IS NULL OR gcal_calendar_id IS NOT NULL);

ALTER TABLE sessions
  ADD CONSTRAINT sessions_gcal_synced_has_event
  CHECK (gcal_sync_status <> 'SYNCED' OR (gcal_event_id IS NOT NULL AND gcal_synced_at IS NOT NULL));

/**
 * One session, one event. The idempotency key §9 demands, held by the database
 * rather than by the worker's good intentions, a retry that races itself
 * cannot produce two rows pointing at two events.
 *
 * Partial, because most sessions have no event yet and NULLs are not distinct
 * enough to be unique in the way this needs.
 */
CREATE UNIQUE INDEX sessions_gcal_event_uq
  ON sessions (gcal_calendar_id, gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;

/** The worker's queue: sessions still waiting or worth retrying. */
CREATE INDEX sessions_gcal_sync_pending
  ON sessions (gcal_sync_status, starts_at)
  WHERE gcal_sync_status IN ('PENDING', 'FAILED');

COMMENT ON COLUMN sessions.gcal_sync_error IS
  'Error CATEGORY from lib/google/calendar.ts (invalid_credentials, rate_limited, …). '
  'Never the provider''s raw response body.';
