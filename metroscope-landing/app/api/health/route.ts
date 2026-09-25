import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is error reporting actually live in THIS runtime?
 *
 * A configured DSN and an initialised client are different facts, and the gap
 * between them is silent: capture on an uninitialised client returns an event
 * id and sends nothing, which looks exactly like "no errors have happened".
 *
 *   active          instrumentation.ts ran and the client is live.
 *   not-configured  no DSN. Inert by design (doc 08 §6a), not a fault.
 *   misconfigured   a DSN is set but nothing initialised, errors are vanishing.
 */
function sentryStatus(): 'active' | 'not-configured' | 'misconfigured' {
  const configured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (Sentry.isInitialized()) return 'active';
  return configured ? 'misconfigured' : 'not-configured';
}

export function GET() {
  return NextResponse.json({
    status: 'ok',
    errorReporting: sentryStatus(),
    service: 'landing',
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    time: new Date().toISOString(),
  });
}
