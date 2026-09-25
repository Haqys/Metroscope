import { z } from 'zod';

/**
 * Public marketing site. No privileged secrets, the anon key is public by
 * design, and the service role key does not exist in this project.
 *
 * It does hold the session, though: /login is here because there is one door
 * for every role (doc 03 FR-AC-3), and the cookie it sets is scoped to
 * COOKIE_DOMAIN so it authenticates all four surfaces.
 */
/**
 * Standalone deploys have no API and no session, so the four variables that
 * exist to reach them are optional there and required everywhere else. Read
 * from `process.env` directly rather than from `lib/standalone.ts`, because
 * this module is what that one would be validating.
 */
const STANDALONE = process.env.NEXT_PUBLIC_STANDALONE === 'true';
const unlessStandalone = <T extends z.ZodTypeAny>(s: T) => (STANDALONE ? s.optional() : s);

const schema = z.object({
  /**
   * The API service. Absent in standalone: the content loaders serve sample
   * content and never call out, so a URL here would only be somewhere to fail.
   */
  API_URL: unlessStandalone(z.string().url()),
  /** Publishing purges this site's cache. Nothing publishes in standalone. */
  REVALIDATE_SECRET: unlessStandalone(z.string().min(16)),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  /** Sign-in. Standalone hides `/login` entirely, so no project is needed. */
  NEXT_PUBLIC_SUPABASE_URL: unlessStandalone(z.string().url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: unlessStandalone(z.string().min(1)),

  /**
   * Deploy this site without the API (doc 15 §1 makes each project standalone;
   * this makes the marketing surface deployable on its own).
   */
  NEXT_PUBLIC_STANDALONE: z.enum(['true', 'false']).optional(),

  /**
   * Real contact details, all optional and none invented. Anything left unset
   * is not rendered at all, see `lib/standalone.ts` for why a missing channel
   * beats a wrong one.
   */
  NEXT_PUBLIC_CONTACT_EMAIL: z.string().email().optional(),
  NEXT_PUBLIC_CONTACT_PHONE: z.string().min(5).optional(),
  NEXT_PUBLIC_CONTACT_WHATSAPP: z.string().min(5).optional(),
  NEXT_PUBLIC_INSTAGRAM_URL: z.string().url().optional(),
  NEXT_PUBLIC_CONTACT_ADDRESS: z.string().min(4).optional(),
  NEXT_PUBLIC_CONTACT_HOURS: z.string().min(4).optional(),
  /**
   * Undefined on localhost, a Domain attribute of "localhost" is rejected by
   * browsers, and omitting it makes the cookie host-only, which is correct for
   * development. In production this is `.metroscope.id`.
   */
  COOKIE_DOMAIN: z.string().optional(),

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
  API_URL: process.env.API_URL,
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  NODE_ENV: process.env.NODE_ENV,

  NEXT_PUBLIC_STANDALONE: process.env.NEXT_PUBLIC_STANDALONE,
  NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined,
  NEXT_PUBLIC_CONTACT_PHONE: process.env.NEXT_PUBLIC_CONTACT_PHONE || undefined,
  NEXT_PUBLIC_CONTACT_WHATSAPP: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || undefined,
  NEXT_PUBLIC_INSTAGRAM_URL: process.env.NEXT_PUBLIC_INSTAGRAM_URL || undefined,
  NEXT_PUBLIC_CONTACT_ADDRESS: process.env.NEXT_PUBLIC_CONTACT_ADDRESS || undefined,
  NEXT_PUBLIC_CONTACT_HOURS: process.env.NEXT_PUBLIC_CONTACT_HOURS || undefined,
});

/**
 * `API_URL` where a caller has already established there is an API.
 *
 * The schema makes it optional in standalone, so its type is `string |
 * undefined` everywhere. Rather than scatter non-null assertions through the
 * routes that forward to the API, they ask for it here and get a real error
 * naming the misconfiguration if it is somehow missing.
 */
export function apiUrl(): string {
  if (!env.API_URL) {
    throw new Error(
      'API_URL is not set. This deployment is standalone (NEXT_PUBLIC_STANDALONE=true); ' +
        'routes that forward to the API must refuse before reaching this.',
    );
  }
  return env.API_URL;
}
