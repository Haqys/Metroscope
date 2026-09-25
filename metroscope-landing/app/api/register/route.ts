import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public registration submit, the top of the funnel.
 *
 * The browser posts here, same origin, and this forwards to
 * `POST /v1/public/registrations`. Going through the server rather than calling
 * the API from the browser keeps `API_URL` out of the client bundle, avoids a
 * CORS preflight on the single most important form on the site, and, the part
 * that actually matters, lets the caller's real IP reach the API, which rate
 * limits this route at three submissions per hour per address.
 *
 * No validation is duplicated here. `CreateLead` is `.strict()` and the API is
 * the only judge of what a valid registration is; this route's job is transport
 * and honest error translation (doc 04 §5.3).
 */
export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  /**
   * Standalone deploys have no API to forward to. Refusing here, before any
   * work, is what keeps the failure honest: the form tells the visitor that
   * online submission is not active yet and offers a real contact channel,
   * rather than reporting a generic outage for something that was never wired.
   */
  if (STANDALONE) {
    return NextResponse.json(
      {
        error: {
          code: 'STANDALONE_PREVIEW',
          message: 'Pendaftaran online belum aktif di pratinjau ini.',
        },
      },
      { status: 503 },
    );
  }

  // CSRF: same check the BFF proxies use. A cross-origin post is never ours.
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.nextUrl.host) {
    logger.warn('register_cross_origin_rejected', { origin, requestId });
    return NextResponse.json(
      { error: { code: 'CROSS_ORIGIN_FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    );
  }

  const body = await req.text();

  let res: Response;
  try {
    res = await fetch(`${env.API_URL}/v1/public/registrations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId,
        /**
         * Without this the API sees this server's address and rate limits the
         * whole site to three registrations an hour, the fourth family of the
         * morning would be told to try again later.
         */
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '',
      },
      body,
      cache: 'no-store',
    });
  } catch (err) {
    logger.error('register_upstream_unreachable', {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: {
          code: 'UPSTREAM_UNREACHABLE',
          message: 'Pendaftaran sedang bermasalah. Coba lagi sebentar lagi.',
        },
      },
      { status: 503 },
    );
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    logger.warn('register_rejected', {
      requestId,
      status: res.status,
      code: payload?.error?.code,
    });
  } else {
    /**
     * `deduplicated` means an existing lead was matched on phone or email and a
     * note was appended instead of a second row being created. The visitor sees
     * the same success screen either way, from their side they registered, and
     * telling them "you already exist" helps nobody.
     */
    logger.info('register_submitted', {
      requestId,
      deduplicated: payload?.data?.deduplicated ?? false,
    });
  }

  return NextResponse.json(payload ?? {}, { status: res.status });
}
