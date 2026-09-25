import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { env } from '@/lib/env';
import { ApiError, errorResponse } from '@/lib/http/errors';
import { logger } from '@/lib/logger';

/**
 * Job endpoints are real HTTP endpoints and must be secured.
 *
 * An unauthenticated /api/jobs/billing-run is both a denial-of-service vector
 * and a data-corruption vector, anyone could issue a month of invoices
 * (doc 04 §7.1).
 */
const receiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/** Vercel Cron sends a bearer secret; QStash sends a signature. Accept either. */
export async function verifyJobRequest(req: NextRequest, rawBody: string): Promise<void> {
  const cron = req.headers.get('authorization');
  if (cron === `Bearer ${env.CRON_SECRET}`) return;

  const signature = req.headers.get('upstash-signature');
  if (signature) {
    const valid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
    if (valid) return;
  }

  throw new ApiError(401, 'UNAUTHORIZED_JOB', 'Job invocation is not authorised.');
}

/**
 * Wrap a job handler so it authenticates and cannot leak internals.
 *
 * Job routes do not go through `handler()`. They have no session, no action
 * grant and no Zod body, and forcing them through it would mean pretending
 * otherwise. But that also meant nothing converted the ApiError above into a
 * response, so an unauthenticated call returned 500 instead of 401: the right
 * refusal reported as a server bug, and an error page where a monitor expects a
 * status code.
 */
export function job(
  handlerFn: (req: NextRequest, rawBody: string) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

    // Read the body once: verification needs the raw text for the signature.
    const rawBody = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();

    try {
      await verifyJobRequest(req, rawBody);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err, requestId);
      throw err;
    }

    try {
      return await handlerFn(req, rawBody);
    } catch (err) {
      logger.error('job_failed', {
        route: new URL(req.url).pathname,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
      /**
       * 500 tells QStash to retry the HTTP call, which would race with the
       * outbox's own backoff, two retry mechanisms on one message, neither
       * aware of the other. Retry state belongs to the outbox alone.
       */
      return NextResponse.json(
        { error: { code: 'JOB_FAILED', message: 'Job execution failed.', requestId } },
        { status: 200 },
      );
    }
  };
}
