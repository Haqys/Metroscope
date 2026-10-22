import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_IMPACTS } from '@/lib/mock/content';

export interface ImpactStory {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  category: 'GLOBAL_DELEGATION' | 'RESEARCH_INNOVATION' | 'PODIUM_AWARD' | 'COMMUNITY';
  categoryLabel: string;
  year: string;
  location?: string | null;
  metric: string;
  metricLabel: string;
  summary: string;
  keyTakeaways?: string[];
  coverUrl: string;
  coverAlt: string;
  gallery?: { url: string; alt: string; caption?: string }[];
  featuredStudent?: string | null;
  articleSlug?: string | null;
  programSlug?: string | null;
  publishedAt: string;
}

export interface ImpactStat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  sublabel: string;
}

export interface ImpactsData {
  stats: ImpactStat[];
  items: ImpactStory[];
}

const EMPTY_IMPACTS: ImpactsData = {
  stats: [],
  items: [],
};

async function get<T>(path: string, tags: string[], fallback: T): Promise<T> {
  const url = `${apiUrl()}/v1/public${path}`;
  try {
    const res = await fetch(url, {
      next: { tags, revalidate: 300 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      logger.warn('impacts_fetch_non_200', { url, status: res.status });
      return fallback;
    }
    const json = await res.json();
    return json.data ?? json;
  } catch (err) {
    logger.error('impacts_fetch_failed', { url, err });
    return fallback;
  }
}

export async function listImpacts(): Promise<ImpactsData> {
  if (STANDALONE) {
    return Promise.resolve(MOCK_IMPACTS);
  }
  return get<ImpactsData>('/impacts', ['impacts'], EMPTY_IMPACTS);
}
