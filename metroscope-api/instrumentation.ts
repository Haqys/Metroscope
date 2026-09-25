import * as Sentry from '@sentry/nextjs';
import { dsn, sentryOptions } from '@/lib/observability/sentry-options';

/**
 * Server and edge runtime initialisation (doc 14 Task 0.6).
 *
 * Next calls `register()` once per runtime before any route handler runs. The
 * DSN check is not an optimisation, without it, `Sentry.init` still installs
 * global handlers and patches the HTTP stack in every local dev process for no
 * benefit.
 */
export async function register() {
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryOptions);
  }
}

/**
 * Route Handler errors.
 *
 * `handler()` already converts known failures into typed responses, so what
 * reaches here is the unexpected kind, the class that currently surfaces to
 * the caller as a bare 500 and to us as one line of stdout.
 */
export const onRequestError = Sentry.captureRequestError;
