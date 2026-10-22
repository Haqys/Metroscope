import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_IMPACTS } from '@/lib/mock/content';
import { getPublicSupabaseClient } from './supabase-articles';

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

export interface SupabaseImpactRow {
  id: string;
  title: string;
  subtitle?: string | null;
  category: string;
  category_label?: string | null;
  year: string;
  location?: string | null;
  metric?: string | null;
  summary: string;
  key_takeaways?: string[] | null;
  cover_url?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

const CATEGORY_MAP: Record<string, 'GLOBAL_DELEGATION' | 'RESEARCH_INNOVATION' | 'PODIUM_AWARD' | 'COMMUNITY'> = {
  GLOBAL_DELEGATION: 'GLOBAL_DELEGATION',
  RESEARCH_INNOVATION: 'RESEARCH_INNOVATION',
  PODIUM_AWARD: 'PODIUM_AWARD',
  COMMUNITY: 'COMMUNITY',
};

const CATEGORY_LABEL_MAP: Record<string, string> = {
  GLOBAL_DELEGATION: 'Delegasi Internasional',
  RESEARCH_INNOVATION: 'Riset Sains Terapan',
  PODIUM_AWARD: 'Prestasi Juara',
  COMMUNITY: 'Dampak Komunitas',
};

export function toImpactStory(row: SupabaseImpactRow): ImpactStory {
  const cat = CATEGORY_MAP[row.category] ?? 'GLOBAL_DELEGATION';
  const catLabel = row.category_label || CATEGORY_LABEL_MAP[cat] || 'Delegasi Internasional';

  let takeaways: string[] = [];
  if (Array.isArray(row.key_takeaways)) {
    takeaways = row.key_takeaways;
  } else if (typeof row.key_takeaways === 'string') {
    try {
      const parsed = JSON.parse(row.key_takeaways);
      if (Array.isArray(parsed)) takeaways = parsed;
    } catch {}
  }

  return {
    id: row.id,
    slug: row.id,
    title: row.title || 'Cerita Dampak Siswa',
    subtitle: row.subtitle || null,
    category: cat,
    categoryLabel: catLabel,
    year: row.year || new Date().getFullYear().toString(),
    location: row.location || null,
    metric: row.metric || 'National Recognition',
    metricLabel: 'Pencapaian',
    summary: row.summary || '',
    keyTakeaways: takeaways,
    coverUrl: row.cover_url || '/images/events/jisf-2026-smp-1.jpg',
    coverAlt: row.title || 'Foto Kegiatan Dampak',
    publishedAt: row.created_at || new Date().toISOString(),
  };
}

const EMPTY_IMPACTS: ImpactsData = {
  stats: [],
  items: [],
};

async function get<T>(path: string, tags: string[], fallback: T): Promise<T> {
  const url = `${apiUrl()}/v1/public${path}`;
  try {
    const res = await fetch(url, {
      next: { tags, revalidate: 60 },
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
  const supabase = getPublicSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('impacts')
        .select('*')
        .eq('status', 'PUBLISHED')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return {
          stats: MOCK_IMPACTS.stats,
          items: (data as SupabaseImpactRow[]).map(toImpactStory),
        };
      }
    } catch (err) {
      logger.error('supabase_impacts_query_error', { err });
    }
  }

  if (STANDALONE) {
    return Promise.resolve(MOCK_IMPACTS);
  }
  return get<ImpactsData>('/impacts', ['impacts'], EMPTY_IMPACTS);
}
