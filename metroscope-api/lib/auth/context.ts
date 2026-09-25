import type { NextRequest } from 'next/server';
import type { AccessTokenClaims } from '@/lib/auth/jwt';
import type { Action } from '@/lib/auth/actions';
import { resolveGrants, type RoleSummary } from '@/lib/auth/grants';

/**
 * Everything a service needs to make a decision, passed explicitly.
 *
 * No ambient/global request state: services stay plain functions and remain
 * unit-testable without HTTP (doc 15 §2).
 */
export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string;
  user: { id: string; email?: string } | null;
  roles: string[];
  /** Same roles, with the display data every shell needs (name, home, tone). */
  roleDetails: RoleSummary[];
  actions: Action[];
  /** Page grants, drive navigation only; never treat as permission to write. */
  pages: string[];
  primaryRole: string | null;
  /** Raw claims, forwarded to Postgres so RLS can evaluate them. */
  claims: Record<string, unknown> | null;
}

export async function buildContext(
  claims: AccessTokenClaims | null,
  opts: { requestId: string; req: NextRequest },
): Promise<RequestContext> {
  const ip = opts.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = opts.req.headers.get('user-agent') ?? 'unknown';

  if (!claims) {
    return {
      requestId: opts.requestId,
      ip,
      userAgent,
      user: null,
      roles: [],
      roleDetails: [],
      actions: [],
      pages: [],
      primaryRole: null,
      claims: null,
    };
  }

  /**
   * Grants come from the database, never from the token, see lib/auth/grants.ts
   * for why. app_metadata on the token is deliberately ignored even when
   * present: a claim the client's identity provider can influence must not
   * decide what the client may do.
   */
  const grants = await resolveGrants(claims.sub);

  return {
    requestId: opts.requestId,
    ip,
    userAgent,
    user: { id: claims.sub, email: claims.email },
    roles: grants.roles,
    roleDetails: grants.roleDetails,
    actions: grants.actions,
    pages: grants.pages,
    primaryRole: grants.primaryRole,
    claims: claims as unknown as Record<string, unknown>,
  };
}
