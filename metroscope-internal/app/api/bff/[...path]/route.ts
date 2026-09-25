import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backend-for-Frontend proxy.
 *
 * Client components call THIS (same-origin) rather than api.metroscope.id
 * directly. The access token is read from the HttpOnly cookie on the server and
 * attached here, so it never reaches browser JavaScript, an XSS cannot become
 * account takeover (doc 04 §3.2).
 *
 * Transport only. No business logic, no decisions: the API authorises every
 * request independently (doc 04 §5.3).
 */
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  // CSRF: cookie-authenticated state changes must originate from this app.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.nextUrl.host) {
      logger.warn('bff_cross_origin_rejected', { origin, requestId });
      return NextResponse.json(
        { error: { code: 'CROSS_ORIGIN_FORBIDDEN', message: 'Forbidden' } },
        { status: 403 },
      );
    }
  }

  const token = await getAccessToken();
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();

  const res = await fetch(`${env.API_URL}/v1/${path.join('/')}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      'content-type': req.headers.get('content-type') ?? 'application/json',
      'x-request-id': requestId,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      /**
       * Forward the idempotency key.
       *
       * The API REQUIRES this header on money-moving routes, convert a lead,
       * verify a payment, and dropping it here made every one of those buttons
       * fail with IDEMPOTENCY_KEY_REQUIRED. The endpoints were covered by tests
       * that called them directly, so the gap was invisible until the UI ran.
       *
       * Deliberately an allowlist rather than forwarding everything: this proxy
       * attaches a privileged token, and blindly relaying caller-controlled
       * headers past that boundary is how a header-based bypass gets built by
       * accident.
       */
      ...(req.headers.get('idempotency-key')
        ? { 'idempotency-key': req.headers.get('idempotency-key')! }
        : {}),
    },
    body,
    cache: 'no-store',
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'cache-control': 'private, no-store',
      'x-request-id': requestId,
    },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
