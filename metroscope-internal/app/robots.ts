import type { MetadataRoute } from 'next';

/**
 * `/robots.txt` for the internal dashboard. Nothing here is public.
 *
 * This app served a copy of the LANDING site's robots.txt: `Allow: /` followed
 * by five `Disallow` lines. robots.txt is scoped to a HOST, so on
 * `internal.metroscope.id` that file invited crawlers into everything it did
 * not happen to name, and the names it did have were copied between four apps
 * that serve four different route sets, so most of them pointed at paths that
 * do not exist here at all.
 *
 * Every byte behind this host is authorised by the API, so a crawl finds a
 * redirect to `/login` rather than data. That is not a reason to be listed: an
 * internal dashboard appearing in search results is an invitation to try the
 * door, and a login page indexed under a company's name is a phishing target
 * with real branding attached.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
