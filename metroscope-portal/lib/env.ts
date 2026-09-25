import { z } from 'zod';

/**
 * Fail fast on boot rather than at the first request.
 *
 * Only NEXT_PUBLIC_* values may reach a client bundle. A privileged secret must
 * NEVER be added here, the API service owns those (doc 04 §6.3). `npm run guard`
 * fails the build if one leaks.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  API_URL: z.string().url(),
  /**
   * Shared cookie domain. OPTIONAL, and must be blank in local development.
   *
   * Cookies are scoped by host and path, not by port, so a host-only cookie
   * set on localhost:3004 already reaches localhost:3002. Setting a Domain the
   * page is not under makes the browser drop the cookie silently, which reads
   * as 'login worked but the session never sticks'. Production sets
   * .metroscope.id; leave it unset anywhere else.
   */
  COOKIE_DOMAIN: z.string().min(1).optional(),
  /**
   * Error reporting. OPTIONAL everywhere, absent means the SDK never
   * initialises, so local development and CI need no Sentry account, and a
   * missing DSN in production degrades to "no error reporting" rather than a
   * boot failure. A DSN is a write-only ingest key, not a credential, which is
   * why this one is safe to expose to the browser.
   */
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  API_URL: process.env.API_URL,
  // Blank string means 'host-only', which is not the same as 'missing'.
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  NODE_ENV: process.env.NODE_ENV,
});
