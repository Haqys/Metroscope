import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public contact submit (doc 13 §9.4, submissions land in `/site/forms`).
 *
 * The same shape as `/api/register`, and deliberately not a shared abstraction
 * with it: two public forms is not a pattern, and the day one needs a different
 * upstream or a different error message the shared version would be the thing
 * in the way. If a third arrives, factor then.
 *
 * Going through the server rather than posting from the browser keeps `API_URL`
 * out of the client bundle, avoids a CORS preflight, and, the part that
 * matters, lets the caller's real IP reach the API, which rate limits this at
 * five messages per hour per address. Without the forwarded header the API
 * would see this server and limit the whole site to five.
 *
 * No validation is duplicated here. `ContactSubmissionBody` is `.strict()` and
 * the API is the only judge of a valid message; this is transport.
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
          message: 'Pengiriman pesan belum aktif di pratinjau ini.',
        },
      },
      { status: 503 },
    );
  }

  // CSRF: a cross-origin post is never ours.
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.nextUrl.host) {
    logger.warn('contact_cross_origin_rejected', { origin, requestId });
    return NextResponse.json(
      { error: { code: 'CROSS_ORIGIN_FORBIDDEN', message: 'Forbidden' } },
      { status: 403 },
    );
  }

  const body = await req.text();

  let res: Response;
  try {
    res = await fetch(`${env.API_URL}/v1/public/contact`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId,
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '',
      },
      body,
      cache: 'no-store',
    });
  } catch (err) {
    logger.error('contact_upstream_unreachable', {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: {
          code: 'UPSTREAM_UNREACHABLE',
          message: 'Pesan sedang tidak bisa dikirim. Coba lagi sebentar lagi.',
        },
      },
      { status: 503 },
    );
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    logger.warn('contact_rejected', { requestId, status: res.status });
  }
  return NextResponse.json(payload ?? {}, { status: res.status });
}
