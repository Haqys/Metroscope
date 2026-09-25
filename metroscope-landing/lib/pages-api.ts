import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Published CMS pages, for the public site (doc 13 §9.3, doc 14 §2.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SERVER ONLY. It reads `API_URL`, which is not a `NEXT_PUBLIC_` value.
 *
 * Tagged `pages` and `page:<slug>`, the same strings `content.registry.ts`
 * emits on publish, so an editor pressing Terbitkan purges the page without a
 * deploy. Same contract as articles and programmes; nothing new here.
 */

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  orderIndex: number;
  visible: boolean;
  visibleFrom: string | null;
  visibleUntil: string | null;
}

export interface PublicPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  locale: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  seoOgImageUrl: string | null;
  seoNoindex: boolean;
  seoJsonLd: Record<string, unknown> | null;
  blocks: Block[];
}

const REVALIDATE = 300;

export async function getPublicPage(slug: string): Promise<PublicPage | null> {
  /**
   * No CMS pages in standalone, and none are invented: a block-composed page
   * is whatever an editor built, so a placeholder would be a page nobody
   * wrote. `/[slug]` renders its not-found, which is the honest answer.
   */
  if (STANDALONE) return null;
  try {
    const res = await fetch(`${apiUrl()}/v1/public/pages/${slug}`, {
      next: { tags: ['pages', `page:${slug}`], revalidate: REVALIDATE },
    });
    if (!res.ok) {
      if (res.status !== 404) logger.warn('public_page_failed', { slug, status: res.status });
      return null;
    }
    return ((await res.json())?.data ?? null) as PublicPage | null;
  } catch (err) {
    logger.error('public_page_unreachable', {
      slug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Redeem a preview token (doc 13 §9.5).
 *
 * Never cached, and it must not be: the point of a preview link is to show the
 * draft as it is right now, and a cached preview would show the reviewer a
 * version the editor has already changed, the one failure that makes review
 * worthless.
 */
export async function getPreviewPage(token: string): Promise<PublicPage | null> {
  /** Previewing drafts needs the CMS that holds them. */
  if (STANDALONE) return null;
  try {
    const res = await fetch(`${apiUrl()}/v1/public/preview?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return ((await res.json())?.data ?? null) as PublicPage | null;
  } catch (err) {
    logger.error('preview_unreachable', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
