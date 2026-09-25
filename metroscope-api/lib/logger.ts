/**
 * Structured logger with redaction applied at the sink, not at call sites,
 * call sites forget (doc 04 §11).
 *
 * Every line carries requestId so one support ticket can be traced across all
 * five deployments.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT =
  /^(authorization|cookie|password|token|access_token|refresh_token|apikey|api_key|service_role|secret|proofUrl|parentPhone)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', m, meta);
  },
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  /**
   * Also reported to Sentry when a DSN is configured (doc 14 Task 0.6).
   *
   * Every `logger.error` in this codebase marks something a human should look
   * at, a dead outbox message, a failed health check, a payment that could not
   * be recorded. On Vercel those were one line of stdout each, visible only to
   * whoever happened to open the log stream. Now they page.
   *
   * `redact()` has already run, so nothing sensitive reaches Sentry from here.
   * The import is dynamic so a missing DSN costs nothing and the SDK never
   * enters the bundle of a runtime that will not use it.
   */
  error: (m: string, meta?: Record<string, unknown>) => {
    emit('error', m, meta);
    void report(m, meta);
  },
};

async function report(message: string, meta?: Record<string, unknown>) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureMessage(message, {
      level: 'error',
      extra: meta ? (redact(meta) as Record<string, unknown>) : undefined,
    });
  } catch {
    // Never let the reporter break the request that was already failing.
  }
}
