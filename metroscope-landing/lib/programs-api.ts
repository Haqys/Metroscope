import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_PROGRAMS, MOCK_PROGRAM_DETAILS } from '@/lib/mock/content';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Published programmes, for the public site (doc 13 §9.4, doc 14 §2.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SERVER ONLY. It reads `API_URL`, which is not a `NEXT_PUBLIC_` value.
 *
 * This file used to carry a warning that it must not be confused with
 * `lib/programs-data.ts`, "which is the marketing fixture behind /programs and
 * the pricing pages… the fixture's slugs have no counterpart in the `programs`
 * table, so a form built on it could only ever submit a programme the API does
 * not have." That fixture is deleted. The marketing pages and the registration
 * picker now read the same endpoint, so they cannot disagree about which
 * programmes exist or what they cost.
 *
 * Cached by the same tags `content.registry.ts` emits on publish, `programs`
 * for anything in a list, `program:<slug>` for one page, so publishing a price
 * change purges the site without a deploy. `revalidate: 300` is the backstop
 * for a purge that never arrives.
 */

export interface PublicProgram {
  id: string;
  slug: string;
  name: string;
  category: 'ACADEMIC' | 'NON_ACADEMIC' | 'CREATIVE' | string;
  levels?: string[];
  summary: string | null;
  description: string | null;
  durationMonths?: number;
  cadence?: string | null;
  priceMonthly?: number;
  dateVenue?: string | null;
  ctaText?: string | null;
  publishedAt: string | null;
  updatedAt: string;
  coverUrl: string | null;
  coverAlt: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
}

/** A published article carrying this programme's id, doc 14 §2.5. */
export interface ProgramStory {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  readingMin: number;
  coverUrl: string | null;
  coverAlt: string | null;
}

export interface EventHighlight {
  title: string;
  subtitle?: string;
  desc: string;
  tag?: string;
}

export interface ItineraryPhase {
  phase: string;
  period: string;
  title: string;
  desc: string;
}

export interface GalleryItem {
  url: string;
  alt: string;
  caption: string;
}

export interface PublicProgramDetail extends PublicProgram {
  headline?: string | null;
  articleType?: string | null;
  venue?: string | null;
  date?: string | null;
  delegationStats?: { label: string; value: string }[];
  researchHighlights?: EventHighlight[];
  itineraryPhases?: ItineraryPhase[];
  gallery?: GalleryItem[];
  body: string | null;
  locale: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  seoOgImageUrl: string | null;
  seoNoindex: boolean;
  seoJsonLd: Record<string, unknown> | null;
  stories: ProgramStory[];
}

const REVALIDATE = 300;

async function get<T>(path: string, tags: string[], fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiUrl()}/v1/public${path}`, {
      next: { tags, revalidate: REVALIDATE },
    });
    if (!res.ok) {
      // A 404 is an answer, not a fault, the caller renders not-found.
      if (res.status !== 404) logger.warn('public_programs_failed', { path, status: res.status });
      return fallback;
    }
    const body = await res.json();
    return (body?.data ?? fallback) as T;
  } catch (err) {
    /**
     * An empty list, never a thrown page.
     *
     * The registration wizard renders a plain explanation and a way to reach a
     * human when this comes back empty. A form that 500s because a list
     * endpoint is briefly down loses the enquiry outright, and enquiries are
     * the only thing this site exists to collect.
     */
    logger.error('public_programs_unreachable', {
      path,
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

export async function listPublicPrograms(): Promise<PublicProgram[]> {
  if (STANDALONE) return MOCK_PROGRAMS;
  const { items } = await get<{ items: PublicProgram[] }>('/programs', ['programs'], { items: [] });
  return items;
}

export function getPublicProgram(slug: string): Promise<PublicProgramDetail | null> {
  if (STANDALONE) {
    return Promise.resolve(MOCK_PROGRAM_DETAILS.find((p) => p.slug === slug) ?? null);
  }
  return get<PublicProgramDetail | null>(
    `/programs/${slug}`,
    ['programs', `program:${slug}`],
    null,
  );
}

/**
 * The category, in words a parent reads rather than the enum a column stores.
 *
 * `program-detail.tsx` had this map privately, so the DETAIL page said
 * "Non-Akademik" while every CARD linking to it said "NON_ACADEMIC", on the
 * home page and on `/programs`. One map, beside the type it describes, and an
 * unknown value falls through to itself rather than to an empty label: a
 * category added to the enum should look unstyled, not invisible.
 */
export function categoryLabel(category: string): string {
  return (
    { ACADEMIC: 'Academic', NON_ACADEMIC: 'Non-Academic', CREATIVE: 'Creative' }[category] ??
    category
  );
}

/** Money is stored as an integer; this is the only place it becomes prose. */
export function formatPrice(priceMonthly: number): string {
  return `IDR ${new Intl.NumberFormat('en-US').format(priceMonthly)} / month`;
}

/**
 * `['SMP','SMA','SD']` → `SD · SMP · SMA`, matching the wireframe's fact grid.
 *
 * Sorted by school progression, not by the order the editor clicked them.
 * `levels` is a `text[]` that preserves insertion order, so a programme edited
 * to add SD last rendered "SMP · SMA · SD", which reads as a mistake to a
 * parent scanning the page, and is one the editor cannot see or fix from the
 * CMS. Ordering belongs to the reader's view of the data, not the storage.
 */
const LEVEL_ORDER = ['SD', 'SMP', 'SMA'];
const LEVEL_LABELS: Record<string, string> = {
  SD: 'Elementary',
  SMP: 'Junior High',
  SMA: 'Senior High',
};

export function formatLevels(levels?: string[] | null): string {
  if (!levels || levels.length === 0) return '-';
  return [...levels]
    .sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))
    .map((lvl) => LEVEL_LABELS[lvl] ?? lvl)
    .join(' · ');
}

export function formatDuration(months?: number | null): string {
  if (!months) return '-';
  return `${months} ${months === 1 ? 'month' : 'months'} / batch`;
}
