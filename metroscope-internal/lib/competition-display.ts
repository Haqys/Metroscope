import type {
  CompetitionFormat,
  CompetitionLevel,
  CompetitionMode,
  CompetitionPhase,
  CompetitionResult,
} from '@/lib/api';

/**
 * How a competition reads on screen (doc 14 §3.4).
 *
 * Every enum the API returns is English; every label a user sees is Indonesian.
 * Kept in one module because four surfaces render these, the internal table,
 * the detail page, the mentor app and the portal, and four copies of
 * "PROVINCIAL → Provinsi" is four chances for two screens to disagree about
 * what the same row says.
 */

export const LEVEL_LABEL: Record<CompetitionLevel, string> = {
  SCHOOL: 'Sekolah',
  REGIONAL: 'Kabupaten/Kota',
  PROVINCIAL: 'Provinsi',
  NATIONAL: 'Nasional',
  INTERNATIONAL: 'Internasional',
};

export const FORMAT_LABEL: Record<CompetitionFormat, string> = {
  INDIVIDUAL: 'Individu',
  TEAM: 'Tim',
  BOTH: 'Individu & Tim',
};

export const MODE_LABEL: Record<CompetitionMode, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  HYBRID: 'Hybrid',
};

export const RESULT_LABEL: Record<CompetitionResult, string> = {
  PENDING: 'Belum Ada Hasil',
  WINNER: 'Juara',
  FINALIST: 'Finalis',
  PARTICIPANT: 'Peserta',
  WITHDRAWN: 'Mengundurkan Diri',
};

export const RESULT_TONE: Record<CompetitionResult, string> = {
  PENDING: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
  WINNER: 'bg-amber-50 text-amber-700 ring-amber-200',
  FINALIST: 'bg-sky-50 text-sky-700 ring-sky-200',
  PARTICIPANT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  WITHDRAWN: 'bg-neutral-100 text-neutral-400 ring-neutral-200',
};

export const PHASE_LABEL: Record<CompetitionPhase, string> = {
  OPEN: 'Pendaftaran Dibuka',
  UPCOMING: 'Segera Dibuka',
  CLOSED: 'Pendaftaran Ditutup',
};

export const PHASE_TONE: Record<CompetitionPhase, string> = {
  OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  UPCOMING: 'bg-sky-50 text-sky-700 ring-sky-200',
  CLOSED: 'bg-neutral-100 text-neutral-500 ring-neutral-200',
};

/**
 * WITA, always.
 *
 * Timestamps are stored UTC and rendered in `Asia/Makassar`, a deadline is the
 * one field where an eight-hour drift changes whether a family thinks they have
 * another day, so the timezone is named rather than left to the browser.
 */
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  });
}

export function formatEventRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00+08:00`).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Makassar',
    });
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

/** Whole rupiah. `feeNote` carries what an integer cannot (tiered team fees). */
export function formatFee(fee: number | null, note: string | null): string {
  if (note) return note;
  if (fee === null) return 'Belum ditentukan';
  if (fee === 0) return 'Gratis';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(fee);
}

/** Days until the deadline, counted in WITA calendar days. Negative once past. */
export function daysUntil(iso: string): number {
  const dayInWita = (d: Date) => Math.floor((d.getTime() + 8 * 3_600_000) / 86_400_000);
  return dayInWita(new Date(iso)) - dayInWita(new Date());
}

/** Readiness bar colour by band, the same three bands everywhere. */
export function readinessTone(pct: number): string {
  if (pct >= 70) return 'from-emerald-400 to-emerald-500';
  if (pct >= 50) return 'from-amber-400 to-amber-500';
  return 'from-maroon to-maroon/70';
}
