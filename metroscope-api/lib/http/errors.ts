import { NextResponse } from 'next/server';

/**
 * Stable, machine-readable error codes (doc 04 §4.3).
 * Never return prose the client has to parse, and never leak stack traces,
 * SQL, or internal identifiers.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorResponse(err: ApiError, requestId: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        requestId,
      },
    },
    {
      status: err.status,
      headers: {
        'x-request-id': requestId,
        'cache-control': 'private, no-store',
      },
    },
  );
}
