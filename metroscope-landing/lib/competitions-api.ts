import { apiUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { STANDALONE } from '@/lib/standalone';
import { MOCK_COMPETITIONS, MOCK_COMPETITION_DETAILS } from '@/lib/mock/content';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The public competition calendar (doc 13 §5.1, doc 14 §3.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SERVER ONLY. It reads `API_URL`, which is not a `NEXT_PUBLIC_` value.
 *
 * doc 13 §5.1 calls this "the single best organic lead magnet Metroscope owns"
 * and §5.2 makes it the natural hub for the *"lomba [bidang] 2026"* keyword
 * cluster. It reads the SAME rows the portal's Info Lomba and the internal
 * database read. One source, which is the whole of §12.8.
 *
 * Tagged `competitions` / `competition:<slug>`, the strings
 * `content.registry.ts` emits on publish, so an editor pressing Terbitkan
 * purges these pages without a deploy.
 */

export type CompetitionPhase = 'OPEN' | 'UPCOMING' | 'CLOSED';

export interface PublicCompetition {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  organizer: string | null;
  venue: string | null;
  level: 'SCHOOL' | 'REGIONAL' | 'PROVINCIAL' | 'NATIONAL' | 'INTERNATIONAL';
  format: 'INDIVIDUAL' | 'TEAM' | 'BOTH';
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  categories: string[];
  levels: ('SD' | 'SMP' | 'SMA')[];
  registrationFee: number | null;
  feeNote: string | null;
  registrationUrl: string | null;
  guidebookUrl: string | null;
  registrationOpensAt: string | null;
  registrationDeadline: string;
  eventStart: string | null;
  eventEnd: string | null;
  phase: CompetitionPhase;
  coverKey: string | null;
  coverAlt: string | null;
}

export interface PublicCompetitionDetail extends PublicCompetition {
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  seoNoindex: boolean;
  seoOgImageKey: string | null;
}

/**
 * Five minutes, like every other public surface.
 *
 * A deadline that has just passed keeps showing for at most that long, and the
 * page says how many days are left rather than "open", so a stale cache is
 * off by a rendering, not by a fact.
 */
const REVALIDATE = 300;

async function get<T>(path: string, tags: string[], fallback: T): Promise<T> {
  try {
    const res = await fetch(`${apiUrl()}/v1/public${path}`, {
      next: { tags, revalidate: REVALIDATE },
    });
    if (!res.ok) {
      if (res.status !== 404)
        logger.warn('public_competitions_failed', { path, status: res.status });
      return fallback;
    }
    return ((await res.json())?.data ?? fallback) as T;
  } catch (err) {
    logger.error('public_competitions_unreachable', {
      path,
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

export async function listCompetitions(
  params: { schoolLevel?: string; limit?: number; includeClosed?: boolean } = {},
): Promise<PublicCompetition[]> {
  if (STANDALONE) {
    const wanted = params.schoolLevel;
    const items = MOCK_COMPETITIONS.filter(
      (c) =>
        (params.includeClosed || c.phase !== 'CLOSED') &&
        (!wanted || c.levels.includes(wanted as 'SD' | 'SMP' | 'SMA')),
    );
    return params.limit ? items.slice(0, params.limit) : items;
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const { items } = await get<{ items: PublicCompetition[] }>(
    `/competitions${qs.size ? `?${qs}` : ''}`,
    ['competitions'],
    { items: [] },
  );
  return items;
}

export function getCompetition(slug: string): Promise<PublicCompetitionDetail | null> {
  if (STANDALONE) {
    return Promise.resolve(MOCK_COMPETITION_DETAILS.find((c) => c.slug === slug) ?? null);
  }
  return get<PublicCompetitionDetail | null>(
    `/competitions/${slug}`,
    ['competitions', `competition:${slug}`],
    null,
  );
}

// ── display ────────────────────────────────────────────────────────────

export const LEVEL_LABEL: Record<PublicCompetition['level'], string> = {
  SCHOOL: 'Sekolah',
  REGIONAL: 'Kabupaten/Kota',
  PROVINCIAL: 'Provinsi',
  NATIONAL: 'Nasional',
  INTERNATIONAL: 'Internasional',
};

export const FORMAT_LABEL: Record<PublicCompetition['format'], string> = {
  INDIVIDUAL: 'Individu',
  TEAM: 'Tim',
  BOTH: 'Individu & Tim',
};

export const MODE_LABEL: Record<PublicCompetition['mode'], string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  HYBRID: 'Hybrid',
};

export const PHASE_LABEL: Record<CompetitionPhase, string> = {
  OPEN: 'Pendaftaran dibuka',
  UPCOMING: 'Segera dibuka',
  CLOSED: 'Pendaftaran ditutup',
};

/** WITA. A deadline is the field where an eight-hour drift changes the answer. */
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  });
}

export function formatEventRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00+08:00`).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Makassar',
    });
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export function formatFee(fee: number | null, note: string | null): string {
  if (note) return note;
  if (fee === null) return 'Hubungi penyelenggara';
  if (fee === 0) return 'Gratis';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(fee);
}

export function daysUntil(iso: string): number {
  const dayInWita = (d: Date) => Math.floor((d.getTime() + 8 * 3_600_000) / 86_400_000);
  return dayInWita(new Date(iso)) - dayInWita(new Date());
}
