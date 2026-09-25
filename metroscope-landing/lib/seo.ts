import { env } from '@/lib/env';
import { ORGANIZATION } from '@/lib/organization';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Shared SEO primitives (doc 13 §5.2 "SEO, currently zero infrastructure").
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything here was already written four times, once per page that needed
 * it, `clamp` verbatim in `/articles/[slug]`, `/programs/[slug]`, `/[slug]`
 * and `/mentors/[slug]`, and the breadcrumb builder twice with the positions
 * counted by hand. Four copies of a rule about title length is four places to
 * change it and three to forget.
 *
 * What is NOT here: the per-page `seoFor()` functions. Each one decides which
 * of a content type's own fields stands in for a missing override, and that
 * decision genuinely differs, an article falls back to its excerpt, a
 * programme to its summary, a mentor to their headline. Collapsing them would
 * need a shape every type pretends to have.
 */

export const SITE = env.NEXT_PUBLIC_SITE_URL;

/** ≤60 for a title, ≤155 for a description, doc 13 §10.7. */
export const clamp = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * Absolute URL for a site-relative path. Structured data must not use paths.
 *
 * The root returns the bare origin, with no trailing slash, because that is
 * what Next's Metadata API emits for `canonical: '/'`, whatever it is given: it
 * resolves against `metadataBase` and an empty pathname disappears. Producing
 * `${SITE}/` here would have meant the home page's `<link rel="canonical">` and
 * its own `<loc>` in the sitemap were two different strings for the same page.
 * RFC 3986 makes them equivalent and every crawler normalises them, so nothing
 * would have broken, but "nothing broke" is a poor reason to publish a URL two
 * ways, and the next person to compare the two files should find them agreeing.
 */
export const absolute = (path: string) => {
  const rel = path.startsWith('/') ? path : `/${path}`;
  return rel === '/' ? SITE : `${SITE}${rel}`;
};

/**
 * The Open Graph and Twitter fields every page shares.
 *
 * `siteName` and `locale` were missing everywhere. Next merges metadata
 * SHALLOWLY down the tree, so a default `openGraph` in the root layout is
 * REPLACED, not extended, by any page that sets its own, which every page
 * with a canonical does. Defaults in the layout would therefore have appeared
 * on precisely the pages nobody shares. A function each page calls cannot be
 * silently overwritten.
 *
 * `og:site_name` is what WhatsApp and Facebook print above a shared link, and
 * doc 13 §5.2 is explicit that Indonesian parents convert on WhatsApp, a card
 * that says only "metroscope.id" is a card from an unknown sender.
 *
 * `type` and the article-specific fields stay at the call site: they are a
 * discriminated union in Next's own types, and a page that knows it is an
 * article should say so where a reader of that page can see it.
 */
export function social(input: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  imageAlt?: string | null;
}) {
  const images = input.image
    ? [{ url: input.image, alt: input.imageAlt ?? input.title }]
    : undefined;

  return {
    openGraph: {
      siteName: ORGANIZATION.name,
      locale: 'id_ID',
      title: input.title,
      description: input.description,
      url: input.url,
      images,
    },
    twitter: {
      /** A bare `summary` card with no image is a grey box; do not claim one. */
      card: (input.image ? 'summary_large_image' : 'summary') as 'summary_large_image' | 'summary',
      title: input.title,
      description: input.description,
      images: input.image ? [input.image] : undefined,
    },
  };
}

/**
 * `BreadcrumbList`, doc 13 §5.2 lists it among the types this site must emit.
 *
 * Positions are 1-based and assigned here rather than written out, which is the
 * bug this replaces: `/articles/[slug]` computed `position: article.categorySlug
 * ? 4 : 3` by hand because a category may or may not be in the trail.
 */
export function breadcrumbList(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: absolute(step.path),
    })),
  };
}

/**
 * `Organization`, doc 13 §5.2.
 *
 * `EducationalOrganization`, the schema.org subtype, rather than the bare
 * `Organization` the doc names: it is the same node to every consumer that only
 * understands the parent type, and it is true. A crawler that does understand
 * the subtype learns what this business actually is, which is the entire point
 * of publishing the node.
 *
 * No `aggregateRating`. The homepage prints "4.8/5" from a literal in the
 * source. Nobody has collected a rating, and structured data is the one place
 * a placeholder stops being a placeholder and becomes a claim made to a search
 * engine on the business's behalf.
 */
export function organizationJsonLd() {
  /**
   * Only the facts that are configured.
   *
   * Structured data is read by machines that will repeat it: a telephone
   * number published here can end up in a knowledge panel, on a map card, and
   * in a voice assistant's answer. Omitting a property costs a little rich
   * presentation; publishing a placeholder teaches the whole web a phone
   * number for this business that belongs to somebody else.
   */
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${SITE}/#organization`,
    name: ORGANIZATION.name,
    legalName: ORGANIZATION.legalName,
    description: ORGANIZATION.description,
    url: SITE,
    ...(ORGANIZATION.email ? { email: ORGANIZATION.email } : {}),
    ...(ORGANIZATION.phone ? { telephone: ORGANIZATION.phone } : {}),
    ...(ORGANIZATION.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: ORGANIZATION.address,
            addressLocality: 'Denpasar',
            addressRegion: 'Bali',
            addressCountry: 'ID',
          },
        }
      : {}),
    areaServed: { '@type': 'Country', name: 'Indonesia' },
    ...(ORGANIZATION.sameAs.length > 0 ? { sameAs: ORGANIZATION.sameAs } : {}),
  };
}

/** The publisher node every `Article` needs, pointing at the one above. */
export const PUBLISHER = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: ORGANIZATION.name,
  url: SITE,
};
