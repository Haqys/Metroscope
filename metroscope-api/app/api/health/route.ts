import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is error reporting actually live in THIS runtime?
 *
 * A configured DSN and an initialised client are different facts, and the gap
 * between them is silent: `Sentry.captureException` on an uninitialised client
 * returns an event id and sends nothing. That is the worst possible failure for
 * observability. It looks exactly like "no errors have happened".
 *
 *   active          instrumentation.ts ran and the client is live.
 *   not-configured  no DSN. Inert by design (doc 08 §6a), not a fault.
 *   misconfigured   a DSN is set but nothing initialised, errors are vanishing.
 */
function sentryStatus(): 'active' | 'not-configured' | 'misconfigured' {
  const configured = Boolean(process.env.SENTRY_DSN);
  if (Sentry.isInitialized()) return 'active';
  return configured ? 'misconfigured' : 'not-configured';
}

/** Liveness plus database reachability. Used by uptime monitoring (doc 08 section 6). */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: 'ok',
      service: 'api',
      database: 'reachable',
      errorReporting: sentryStatus(),
      latencyMs: Date.now() - started,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      time: new Date().toISOString(),
    });
  } catch (err) {
    /**
     * Drizzle wraps driver failures, so `message` is only ever
     * "Failed query: SELECT 1", useless for diagnosis. The actionable reason
     * (auth failure, DNS, TLS, connection limit) lives on `cause`.
     */
    const cause = err instanceof Error ? (err.cause as Error | undefined) : undefined;
    logger.error('health_check_failed', {
      message: err instanceof Error ? err.message : String(err),
      cause: cause?.message,
      code: (cause as { code?: string } | undefined)?.code,
    });
    return NextResponse.json(
      { status: 'degraded', service: 'api', database: 'unreachable' },
      { status: 503 },
    );
  }
}
