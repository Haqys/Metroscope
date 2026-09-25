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
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
