import { logger } from '@/lib/logger';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Google service-account credentials, server-only, and optional.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * doc 03 §6.2 offers two models: "service account or per-mentor OAuth". doc 07
 * §6 draws only one of them, `Session scheduled → [[Worker: calendar-sync]] →
 * Google Calendar event + Meet link → Session.gcalEventId + meetUrl`, and the
 * schema has nowhere to put a per-user refresh token. So this is the shared
 * application calendar: one service account, one configured calendar, events
 * created *by the business* rather than inside a mentor's personal calendar.
 *
 * **If the product later wants events in a mentor's own Google account, this is
 * not the mechanism.** A service account cannot write to a personal calendar it
 * has not been shared with, and pretending otherwise by impersonating users is
 * exactly the "fake Connect Google flow" that must not be built. That would
 * need a real OAuth consent flow and a token store, and it is not this task.
 *
 * ── Why absent is a supported state ──
 *
 * Scheduling worked before Google existed and must keep working when Google is
 * unconfigured or down (doc 03 §7: "calendar sync failures are retried and
 * surfaced"). No variable here is required to boot, which is why they are not
 * in `lib/env.ts`, a missing key disables the integration rather than taking
 * the API down with it. `calendarConfigured()` is the switch every caller asks.
 */

export interface GoogleCredentials {
  clientEmail: string;
  privateKey: string;
  calendarId: string;
}

/**
 * A PEM in an environment variable has its newlines escaped, because dotenv and
 * every deployment UI store it on one line. `crypto` will not parse it in that
 * form and the error it gives ("error:1E08010C:DECODER routines") names nothing
 * useful, so the unescaping happens once, here.
 */
function normalisePrivateKey(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n');
}

const PEM_HEADER = '-----BEGIN PRIVATE KEY-----';

let cached: GoogleCredentials | null | undefined;

/**
 * Read and validate the configuration.
 *
 * Returns null when the integration is simply not configured, the normal state
 * in development and on any deployment that has not been given a service
 * account yet. Throws only when it IS configured and configured wrongly, which
 * is a different thing and deserves a different noise level.
 */
export function googleCredentials(): GoogleCredentials | null {
  if (cached !== undefined) return cached;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();

  if (!clientEmail && !rawKey && !calendarId) {
    cached = null;
    return null;
  }

  /**
   * Partially configured is a mistake worth naming. Two of three set is
   * somebody halfway through a deployment, and silently treating it as "off"
   * means the calendar quietly never syncs and nobody finds out until a parent
   * asks where the Meet link is.
   */
  const missing = [
    !clientEmail && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    !rawKey && 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    !calendarId && 'GOOGLE_CALENDAR_ID',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Google Calendar is partially configured, missing ${missing.join(', ')}. ` +
        'Set all three or none; two of three syncs nothing and reports nothing.',
    );
  }

  const privateKey = normalisePrivateKey(rawKey!);

  if (!privateKey.includes(PEM_HEADER)) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not a PKCS#8 PEM. Copy the `private_key` field ' +
        'from the service-account JSON verbatim, including the BEGIN/END lines.',
    );
  }

  /**
   * `primary` means "whatever calendar this identity owns", and a service
   * account owns one nobody can see. Refusing it here turns a silent
   * misconfiguration, events created into the void, into a boot-time message.
   * doc 03 §6.2 wants an explicit, shareable calendar.
   */
  if (calendarId === 'primary') {
    throw new Error(
      "GOOGLE_CALENDAR_ID must not be `primary`. A service account's primary calendar is " +
        'invisible to humans; create a calendar, share it with the service account as ' +
        '"Make changes to events", and use its calendar ID.',
    );
  }

  cached = { clientEmail: clientEmail!, privateKey, calendarId: calendarId! };

  /** The email and calendar id are identifiers, not secrets. The key is never logged. */
  logger.info('google_calendar_configured', {
    clientEmail: cached.clientEmail,
    calendarId: cached.calendarId,
  });

  return cached;
}

export function calendarConfigured(): boolean {
  try {
    return googleCredentials() !== null;
  } catch {
    /**
     * Misconfigured is not configured, for the purposes of "should we try".
     * The throw above still reaches anybody who asks for the credentials.
     */
    return false;
  }
}

/** Tests mutate the environment; nothing else should need this. */
export function resetCredentialCache(): void {
  cached = undefined;
}
