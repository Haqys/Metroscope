import { z } from 'zod';

/**
 * Server-only configuration. This project is the ONLY one holding privileged
 * credentials (doc 15 §5.4); none of these may ever be prefixed NEXT_PUBLIC_.
 */
const schema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /**
   * The GoTrue issuer, `https://<ref>.supabase.co/auth/v1`, which is also
   * where the JWKS lives and what every token's `iss` claim contains.
   *
   * Pointing this at the project URL or `/rest/v1` is an easy mistake with a
   * confusing signature: login still succeeds (that call is made with the anon
   * key and never verifies a token), and then EVERY authenticated request
   * returns 401 because the JWKS fetch 404s or 401s. Failing at boot instead.
   */
  SUPABASE_JWT_ISSUER: z
    .string()
    .url()
    .refine((u) => u.replace(/\/+$/, '').endsWith('/auth/v1'), {
      message:
        'SUPABASE_JWT_ISSUER must end with /auth/v1. It is the GoTrue issuer, not the project or REST URL.',
    }),

  // Postgres. Supavisor TRANSACTION pooler (:6543), never :5432 at runtime.
  DATABASE_URL: z
    .string()
    .url()
    .refine((u) => u.includes(':6543'), {
      message: 'Runtime must use the Supavisor transaction pooler on :6543 (doc 08 §2.4).',
    }),

  // Upstash
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1),

  // Jobs + revalidation
  CRON_SECRET: z.string().min(32),
  REVALIDATE_SECRET: z.string().min(16),
  LANDING_URL: z.string().url(),

  // CORS allowlist, explicit origins only, never '*'
  ALLOWED_ORIGINS: z.string().min(1),

  /**
   * Error reporting. OPTIONAL, absent means the SDK never initialises, so
   * local development and CI need no Sentry account, and a missing DSN in
   * production degrades to "no error reporting" rather than a boot failure.
   * A DSN is a write-only ingest key, not a credential.
   */
  SENTRY_DSN: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = schema.parse(process.env);

export const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
