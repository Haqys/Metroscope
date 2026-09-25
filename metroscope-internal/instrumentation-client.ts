import * as Sentry from '@sentry/nextjs';
import { dsn, sentryOptions } from '@/lib/observability/sentry-options';

/**
 * Browser runtime.
 *
 * Only reads `NEXT_PUBLIC_SENTRY_DSN`; the bare `SENTRY_DSN` is server-only and
 * is not inlined into the client bundle. Session Replay is deliberately absent,
 * these surfaces render guardian names, invoice amounts and payment proofs,
 * and recording that is a data-protection decision, not a debugging one.
 */
if (dsn) {
  Sentry.init({
    ...sentryOptions,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
