import type { MetadataRoute } from 'next';

/**
 * `/robots.txt` for the student portal. Nothing here is public.
 *
 * It previously served a copy of the landing site's file, which said `Allow: /`
 * and then disallowed five paths belonging to a different app on a different
 * host. See `metroscope-internal/app/robots.ts` for the full account.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
