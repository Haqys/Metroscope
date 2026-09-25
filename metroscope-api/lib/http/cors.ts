import { NextRequest, NextResponse } from 'next/server';
import { allowedOrigins } from '@/lib/env';

/**
 * Explicit allowlist. Never '*', never a reflected Origin header.
 *
 * ⚠️ CORS is not a security control. It only constrains browsers. Every
 * endpoint authenticates and authorises independently, because a request may
 * arrive from cURL (doc 04 §3.3).
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-request-id,idempotency-key',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function preflight(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}
