import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';

/**
 * Verify a Supabase access token.
 *
 * JWKS is fetched once and cached by jose (10 min), so this costs nothing per
 * request after warm-up. Signature, expiry and issuer are all checked, a
 * decoded-but-unverified token is worthless.
 */
const JWKS = createRemoteJWKSet(new URL(`${env.SUPABASE_JWT_ISSUER}/.well-known/jwks.json`));

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: {
    roles?: string[];
    actions?: string[];
    primary_role?: string;
  };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.SUPABASE_JWT_ISSUER,
    });
    if (!payload.sub) throw new Error('missing sub');
    return payload as AccessTokenClaims;
  } catch {
    throw new ApiError(401, 'INVALID_TOKEN', 'Sesi tidak valid atau sudah berakhir.');
  }
}
