import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import { logger } from '@/lib/logger';
import { googleCredentials, type GoogleCredentials } from './credentials';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Google Calendar over plain fetch.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Same reasoning as `channels/resend.ts`: this is a handful of REST calls with
 * a bearer token, and `googleapis` is a very large dependency whose main value
 * is types we can write in twenty lines. Calling it directly also keeps the
 * retryable/permanent split explicit, which is the part the outbox depends on.
 *
 * ⚠️ Nothing in this file may log, return or embed the private key. The only
 * credential-shaped value that leaves is a short-lived access token, and it
 * leaves only in an Authorization header.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * The one scope this integration needs.
 *
 * `calendar.events` can read and write events on calendars the account can
 * already see. It cannot create or delete calendars, and it cannot enumerate
 * the account's calendar list, which is the right blast radius for something
 * whose whole job is putting lessons on one shared calendar.
 */
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/**
 * Google's error taxonomy, reduced to the only question the outbox asks.
 *
 * `retryable` is not a guess about politeness. It decides whether the message
 * comes back in a minute or dies with its reason attached. Getting it wrong in
 * either direction is expensive: retrying a revoked key forever buries the real
 * problem under attempt counts, and giving up on a 503 loses a lesson's event.
 */
export type CalendarErrorCategory =
  | 'invalid_credentials'
  | 'calendar_not_found'
  | 'insufficient_permission'
  | 'rate_limited'
  | 'invalid_event'
  | 'network'
  | 'server_error'
  | 'unknown';

/**
 * Fields are declared and assigned rather than written as constructor
 * parameter properties (`constructor(readonly category: …)`).
 *
 * Parameter properties EMIT code, so Node's `--experimental-strip-types`, which
 * only deletes type annotations and never rewrites, refuses the file with
 * `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. That made this module unimportable by
 * `verify:calendar`, the one script whose entire job is to exercise it against
 * the real Google account. The longer form costs four lines and keeps the
 * integration runnable outside the Next bundler.
 */
export class CalendarError extends Error {
  readonly category: CalendarErrorCategory;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    category: CalendarErrorCategory,
    retryable: boolean,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'CalendarError';
    this.category = category;
    this.retryable = retryable;
    this.status = status;
  }
}

function classify(status: number, body: string): CalendarError {
  /** Google puts the useful part in `error.errors[].reason`; fall back to the text. */
  let reason = '';
  try {
    /**
     * Two different error shapes wear the same field name. The Calendar API
     * returns { error: { message, errors: [{ reason }] } }; the OAuth token
     * endpoint returns { error: 'invalid_grant', error_description: '...' },
     * a STRING where the other has an object. Reading only the first shape
     * left  empty for every credential failure.
     */
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string; errors?: { reason?: string }[] };
      error_description?: string;
    };
    /**
     * Reason AND message, not one or the other.
     *
     * `errors[0].reason` is a machine token and is often just `invalid`, while
     * `error.message` carries the sentence that says what is actually wrong,
     * "Invalid conference type value.". Keeping only the reason threw the
     * useful half away, which made a Meet-capability problem indistinguishable
     * from a malformed event and defeated the code that degrades gracefully
     * when Google refuses a conference.
     */
    reason =
      typeof parsed.error === 'string'
        ? [parsed.error, parsed.error_description].filter(Boolean).join(': ')
        : [parsed.error?.errors?.[0]?.reason, parsed.error?.message].filter(Boolean).join(': ');
  } catch {
    reason = body.slice(0, 200);
  }

  const detail = `google ${status}: ${reason || body.slice(0, 200)}`;

  /**
   * The token endpoint answers a bad or revoked service-account key with
   * **400 invalid_grant**, not 401. Mapping 400 straight to `invalid_event`
   * sent an operator to look at the lesson when the problem was the key, the
   * outage drill produced exactly that misdiagnosis. Credential problems are
   * checked before the generic 400 for that reason.
   */
  if (/invalid_grant|invalid_client|unauthorized_client/i.test(reason)) {
    return new CalendarError('invalid_credentials', false, detail, status);
  }
  if (status === 401) return new CalendarError('invalid_credentials', false, detail, status);
  if (status === 403) {
    /**
     * 403 is two different problems wearing one status. Quota is a "later";
     * a permission problem is a "never, until a human shares the calendar".
     */
    if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(reason)) {
      return new CalendarError('rate_limited', true, detail, status);
    }
    return new CalendarError('insufficient_permission', false, detail, status);
  }
  if (status === 404) return new CalendarError('calendar_not_found', false, detail, status);
  if (status === 429) return new CalendarError('rate_limited', true, detail, status);
  if (status === 400) return new CalendarError('invalid_event', false, detail, status);
  if (status >= 500) return new CalendarError('server_error', true, detail, status);
  return new CalendarError('unknown', status >= 500, detail, status);
}

// ── access token ─────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number;
}
let tokenCache: CachedToken | null = null;

/**
 * The JWT-bearer flow: sign an assertion with the service account's key, trade
 * it for an access token. Tokens last an hour; this re-mints a minute early so
 * a request never starts with a token that expires mid-flight.
 */
async function accessToken(creds: GoogleCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) return tokenCache.token;

  let assertion: string;
  try {
    const key = createPrivateKey(creds.privateKey);
    assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(creds.clientEmail)
      .setSubject(creds.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
  } catch (err) {
    /**
     * A malformed key fails here, before any network call. The message is the
     * decoder's and says nothing about the key's contents, but be explicit that
     * nothing is being echoed.
     */
    throw new CalendarError(
      'invalid_credentials',
      false,
      `service account key could not be used to sign: ${err instanceof Error ? err.name : 'error'}`,
    );
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new CalendarError(
      'network',
      true,
      err instanceof Error ? err.message : 'token request failed',
    );
  }

  const body = await res.text();
  if (!res.ok) throw classify(res.status, body);

  const parsed = JSON.parse(body) as { access_token: string; expires_in: number };
  tokenCache = { token: parsed.access_token, expiresAt: now + parsed.expires_in };
  return parsed.access_token;
}

/** Tests and credential changes invalidate the token. */
export function resetTokenCache(): void {
  tokenCache = null;
}

// ── events ───────────────────────────────────────────────────────────────

export interface CalendarEventInput {
  summary: string;
  description: string;
  /** RFC3339 without offset, paired with `timeZone`, see calendar.service.ts. */
  startsAt: string;
  endsAt: string;
  timeZone: string;
  location?: string | null;
  attendees?: string[];
  /** Ask Google to mint a Meet conference for this event. */
  withMeet?: boolean;
  /**
   * The lesson this event represents, written onto the event itself.
   *
   * This is what makes `findEventBySessionId` possible, and it is the only
   * reason the §9 reconciliation works: after a create that Google accepted and
   * we failed to record, the id is on Google's copy even though it is not on
   * ours. A private extended property is invisible to attendees.
   */
  sessionId: string;
}

export interface CalendarEvent {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
}

function toGoogleEvent(input: CalendarEventInput, requestId?: string) {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location ?? undefined,
    start: { dateTime: input.startsAt, timeZone: input.timeZone },
    end: { dateTime: input.endsAt, timeZone: input.timeZone },
    extendedProperties: { private: { metroscopeSessionId: input.sessionId } },
    /**
     * Attendees are deliberately NOT sent by default. A service account adding
     * attendees to an event triggers Google invitations from an address nobody
     * recognises, and on Workspace it needs domain-wide delegation the project
     * has not been given. Participants learn about lessons through the portal
     * and the Resend emails, which is the channel doc 08 §4 already owns.
     */
    ...(input.attendees?.length ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
    ...(input.withMeet && requestId
      ? {
          conferenceData: {
            createRequest: {
              /**
               * Idempotency at Google's end. Re-sending the same requestId for
               * the same event returns the existing conference rather than
               * minting a second Meet, which matters because our own retry
               * path can re-issue this call after a timeout.
               */
              requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }
      : {}),
  };
}

async function call(
  path: string,
  init: RequestInit & { query?: Record<string, string> },
): Promise<Response> {
  const creds = googleCredentials();
  if (!creds)
    throw new CalendarError('invalid_credentials', false, 'Google Calendar not configured');

  const token = await accessToken(creds);
  const url = new URL(`${CALENDAR_BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  try {
    return await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new CalendarError(
      'network',
      true,
      err instanceof Error ? err.message : 'calendar request failed',
    );
  }
}

const calendarPath = (creds: GoogleCredentials, suffix = '') =>
  `/calendars/${encodeURIComponent(creds.calendarId)}/events${suffix}`;

export async function createEvent(
  input: CalendarEventInput,
  requestId: string,
): Promise<CalendarEvent> {
  const creds = googleCredentials()!;
  const res = await call(calendarPath(creds), {
    method: 'POST',
    body: JSON.stringify(toGoogleEvent(input, requestId)),
    query: input.withMeet ? { conferenceDataVersion: '1' } : {},
  });
  const body = await res.text();
  if (!res.ok) throw classify(res.status, body);
  return JSON.parse(body) as CalendarEvent;
}

export async function patchEvent(
  eventId: string,
  input: CalendarEventInput,
  requestId: string,
): Promise<CalendarEvent> {
  const creds = googleCredentials()!;
  const res = await call(calendarPath(creds, `/${encodeURIComponent(eventId)}`), {
    method: 'PATCH',
    body: JSON.stringify(toGoogleEvent(input, requestId)),
    query: input.withMeet ? { conferenceDataVersion: '1' } : {},
  });
  const body = await res.text();
  if (!res.ok) throw classify(res.status, body);
  return JSON.parse(body) as CalendarEvent;
}

export async function getEvent(eventId: string): Promise<CalendarEvent | null> {
  const creds = googleCredentials()!;
  const res = await call(calendarPath(creds, `/${encodeURIComponent(eventId)}`), { method: 'GET' });
  if (res.status === 404 || res.status === 410) return null;
  const body = await res.text();
  if (!res.ok) throw classify(res.status, body);
  return JSON.parse(body) as CalendarEvent;
}

/**
 * Cancel rather than delete.
 *
 * `status: 'cancelled'` leaves the event in participants' calendars marked as
 * cancelled, which is what a family needs to see. A hard DELETE makes it vanish
 * silently, and somebody turns up to a lesson that is not happening (§11).
 */
export async function cancelEvent(eventId: string): Promise<void> {
  const creds = googleCredentials()!;
  const res = await call(calendarPath(creds, `/${encodeURIComponent(eventId)}`), {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  });
  if (res.status === 404 || res.status === 410) {
    // Already gone. The desired state is the actual state.
    logger.info('calendar_event_already_absent', { eventId });
    return;
  }
  if (!res.ok) throw classify(res.status, await res.text());
}

/**
 * Find an event this application created, by the lesson id stamped on it.
 *
 * The reconciliation path for §9's nastiest case: Google accepted the insert
 * and the process died before the id was stored. Without this, the retry makes
 * a second event; with it, the retry finds the first one and adopts it.
 */
export async function findEventBySessionId(sessionId: string): Promise<CalendarEvent | null> {
  const creds = googleCredentials()!;
  const res = await call(calendarPath(creds), {
    method: 'GET',
    query: {
      privateExtendedProperty: `metroscopeSessionId=${sessionId}`,
      showDeleted: 'true',
      maxResults: '1',
    },
  });
  const body = await res.text();
  if (!res.ok) throw classify(res.status, body);
  const parsed = JSON.parse(body) as { items?: CalendarEvent[] };
  return parsed.items?.[0] ?? null;
}
