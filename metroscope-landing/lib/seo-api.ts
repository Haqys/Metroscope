import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_SITEMAP_ENTRIES } from '@/lib/mock/content';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  What is published, for `sitemap.xml` (doc 14 §2.8).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SERVER ONLY. It reads `API_URL`, which is not a `NEXT_PUBLIC_` value.
 *
 * Tagged `sitemap`, which `content.registry.ts` now emits on every publish of a
 * type that has a public URL. So an editor pressing Terbitkan puts the new URL
 * in the sitemap without a deploy and without waiting out a cache window,
 * which matters more here than on a page a human can refresh: nobody looks at
 * the sitemap, so a stale one stays stale unnoticed.
 */

export interface SitemapEntry {
  path: string;
  lastModified: string | null;
  type: string;
}

const REVALIDATE = 300;

export async function listSitemapEntries(): Promise<SitemapEntry[]> {
  if (STANDALONE) return MOCK_SITEMAP_ENTRIES;
  try {
    const res = await fetch(`${apiUrl()}/v1/public/sitemap`, {
      next: { tags: ['sitemap'], revalidate: REVALIDATE },
    });
    if (!res.ok) {
      logger.warn('sitemap_fetch_failed', { status: res.status });
      return [];
    }
    return ((await res.json())?.data?.items ?? []) as SitemapEntry[];
  } catch (err) {
    /**
     * An empty list, never a thrown route.
     *
     * `sitemap.xml` still renders with the static routes below it, so the site
     * keeps telling crawlers about `/`, `/programs` and `/articles` while the
     * API is unreachable. A 500 here would make the whole sitemap disappear,
     * and a sitemap that intermittently 500s is worse than a short one, because
     * a crawler backs off from the file entirely.
     */
    logger.error('sitemap_unreachable', {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
