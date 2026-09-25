import type { ErrorEvent } from '@sentry/nextjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sentry configuration, shared by every runtime in this project.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two properties matter more than anything else here.
 *
 * **No DSN means no-op.** `Sentry.init({ dsn: undefined })` disables the SDK
 * entirely, no network, no overhead. Local development and CI therefore need
 * no Sentry account and no env var, and a missing DSN in production degrades to
 * "no error reporting" rather than a boot failure. Observability must never be
 * the reason a deploy cannot start.
 *
 * **This system handles guardian PII.** Names, phone numbers, email addresses,
 * payment proofs. `sendDefaultPii` is off, and `beforeSend` strips anything
 * that looks like a credential or a personal identifier from the payload before
 * it leaves the process, the same list `lib/logger.ts` redacts, because an
 * exception carrying a request body is exactly as sensitive as a log line
 * carrying one.
 */
const REDACT =
  /^(authorization|cookie|password|token|access_token|refresh_token|apikey|api_key|service_role|secret|proofurl|proof_key|parentphone|parent_phone|phone|email)$/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

export const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

export const sentryOptions = {
  dsn,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  /**
   * The commit is what makes a stack trace actionable six weeks later. Vercel
   * sets this on every deployment; locally it is simply absent.
   */
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  /**
   * 10% of traces in production, everything in preview.
   *
   * Full tracing on a Vercel function bills per invocation twice, once for the
   * span and once for the egress, and the p50 request is not the one worth
   * looking at. Errors are always captured regardless of this rate.
   */
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,

  sendDefaultPii: false,

  beforeSend(event: ErrorEvent): ErrorEvent {
    const e = event as unknown as Record<string, unknown>;
    if (e.request) e.request = scrub(e.request);
    if (e.extra) e.extra = scrub(e.extra);
    if (e.contexts) e.contexts = scrub(e.contexts);
    /**
     * Keep the user id. It is what turns "someone hit this" into "this family
     * cannot pay their invoice", but never the identifying fields alongside it.
     */
    if (e.user && typeof e.user === 'object') {
      const { id } = e.user as { id?: string };
      e.user = id ? { id } : undefined;
    }
    return event;
  },
};
