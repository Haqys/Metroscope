import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_FAQ, MOCK_MENTORS, MOCK_MENTOR_DETAILS, MOCK_TESTIMONIALS } from '@/lib/mock/content';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAQ, testimonials and mentors, for the public site (doc 14 §2.7).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SERVER ONLY. It reads `API_URL`, which is not a `NEXT_PUBLIC_` value.
 *
 * Tagged with the strings `content.registry.ts` emits on publish, so an editor
 * pressing Terbitkan purges these surfaces without a deploy. Fourth, fifth and
 * sixth consumers of a contract §2.4 established and nothing here changes.
 */

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  orderIndex: number;
  locale: string;
}

export interface Testimonial {
  id: string;
  quote: string;
  authorName: string;
  authorRole: string | null;
  featured: boolean;
  orderIndex: number;
  publishedAt: string | null;
  programSlug: string | null;
  programName: string | null;
  photoUrl: string | null;
  photoAlt: string | null;
}

export interface Mentor {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  specialisms: string[];
  orderIndex: number;
  publishedAt: string | null;
  photoUrl: string | null;
  photoAlt: string | null;
}

export interface MentorDetail extends Mentor {
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  seoNoindex: boolean;
  articles: { slug: string; title: string; excerpt: string | null; readingMin: number }[];
}

const REVALIDATE = 300;

async function get<T>(path: string, tags: string[], fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiUrl()}/v1/public${path}`, {
      next: { tags, revalidate: REVALIDATE },
    });
    if (!res.ok) {
      if (res.status !== 404) logger.warn('public_surface_failed', { path, status: res.status });
      return fallback;
    }
    return ((await res.json())?.data ?? fallback) as T;
  } catch (err) {
    /**
     * An empty section, never a thrown page. A marketing site that 500s in full
     * because one list endpoint blinked loses enquiries for the duration.
     */
    logger.error('public_surface_unreachable', {
      path,
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

export async function listFaq(): Promise<FaqEntry[]> {
  if (STANDALONE) return MOCK_FAQ;
  const { items } = await get<{ items: FaqEntry[] }>('/faq', ['faq'], { items: [] });
  return items;
}

export async function listTestimonials(): Promise<Testimonial[]> {
  if (STANDALONE) return MOCK_TESTIMONIALS;
  const { items } = await get<{ items: Testimonial[] }>('/testimonials', ['testimonials'], {
    items: [],
  });
  return items;
}

export async function listMentors(): Promise<Mentor[]> {
  if (STANDALONE) return MOCK_MENTORS;
  const { items } = await get<{ items: Mentor[] }>('/mentors', ['mentors'], { items: [] });
  return items;
}

export function getMentor(slug: string): Promise<MentorDetail | null> {
  if (STANDALONE) {
    return Promise.resolve(MOCK_MENTOR_DETAILS.find((m) => m.slug === slug) ?? null);
  }
  return get<MentorDetail | null>(`/mentors/${slug}`, ['mentors', `mentor:${slug}`], null);
}
