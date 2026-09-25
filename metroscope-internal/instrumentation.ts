import * as Sentry from '@sentry/nextjs';
import { dsn, sentryOptions } from '@/lib/observability/sentry-options';

/** Server + edge runtimes. No DSN configured means the SDK never initialises. */
export async function register() {
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryOptions);
  }
}

export const onRequestError = Sentry.captureRequestError;
