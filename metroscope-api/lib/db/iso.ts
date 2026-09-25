/**
 * Postgres timestamp → ISO 8601.
 *
 * The driver hands back `2026-08-07 03:42:40.653811+00`. Postgres's own
 * rendering, with a space instead of `T`. `new Date()` parses it, so every date
 * on a page LOOKS right; what breaks is everything a machine reads.
 * `<meta property="article:published_time">`, `datePublished` in JSON-LD,
 * `<time datetime>`, `<lastmod>` in a sitemap and `<pubDate>` in a feed all
 * require a format this one is not, and a crawler that cannot parse a date
 * drops the field silently. Nothing on the page changes.
 *
 * §2.4 found this in the article surface and fixed it there. §2.8 is the second
 * consumer: a sitemap whose `lastmod` a crawler cannot parse is a sitemap
 * without lastmod, and the whole point of publishing one is to say what changed
 * and when. Returns `null` rather than guessing when the value is unparseable.
 */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) && typeof value !== 'string') return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
