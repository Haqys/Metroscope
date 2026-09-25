import type { AssessmentCategory, CriterionKey } from '@/lib/api';

/**
 * How an assessment reads on screen (doc 03 FR-ASV-0, doc 14 §3.5).
 *
 * **The scale is /10, everywhere.** FR-ASV-0 exists because v1.0 said /10 while
 * doc 05 rendered 81/100 in three places, and the ruling is explicit: "one
 * scale, /10, one decimal, star rating, in the portal, the mentor form, and
 * the internal record". The form this replaces used 0–100 sliders; that was the
 * defect, not the design.
 */

export const CRITERIA: { key: CriterionKey; label: string; hint: string }[] = [
  {
    key: 'UNDERSTANDING',
    label: 'Pemahaman Materi',
    hint: 'Seberapa dalam siswa menguasai materi yang sudah diajarkan.',
  },
  {
    key: 'PARTICIPATION',
    label: 'Keaktifan di Kelas',
    hint: 'Bertanya, menjawab, dan ikut serta selama sesi.',
  },
  {
    key: 'DISCIPLINE',
    label: 'Kedisiplinan & Kehadiran',
    hint: 'Datang tepat waktu, mengerjakan latihan, konsisten hadir.',
  },
  {
    key: 'READINESS',
    label: 'Kesiapan Menghadapi Lomba',
    hint: 'Kesiapan menghadapi lomba terdekat yang ditargetkan.',
  },
];

export const CATEGORY_LABEL: Record<AssessmentCategory, string> = {
  SANGAT_BAIK: 'Sangat Baik',
  BAIK: 'Baik',
  CUKUP: 'Cukup',
  PERLU_PERHATIAN: 'Perlu Perhatian',
};

export const CATEGORY_TONE: Record<AssessmentCategory, string> = {
  SANGAT_BAIK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  BAIK: 'bg-navy-light text-navy ring-navy/20',
  CUKUP: 'bg-amber-50 text-amber-700 ring-amber-200',
  PERLU_PERHATIAN: 'bg-maroon-light text-maroon ring-maroon/20',
};

/** The same three bands the score bar uses, so colour never contradicts label. */
export function scoreTone(score: number): string {
  if (score >= 9) return 'from-emerald-400 to-emerald-500';
  if (score >= 7.5) return 'from-navy to-navy-dark';
  if (score >= 6) return 'from-amber-400 to-amber-500';
  return 'from-maroon to-maroon/70';
}

/** "2026-08" → "Agustus 2026". Periods are WITA calendar months. */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  });
}

/**
 * How overdue a pending student is, in words.
 *
 * Ordering already puts the worst first; this only names what the row shows.
 * No threshold is invented because no document gives one. FR-ASN-1 splits two
 * ways and nothing more, so "3 bulan" is a fact and not a policy.
 */
export function urgencyLabel(months: number | null): string {
  if (months === null) return 'Belum pernah dinilai';
  if (months === 0) return 'Sudah dinilai bulan ini';
  if (months === 1) return 'Terakhir bulan lalu';
  return `Terakhir ${months} bulan lalu`;
}

export function urgencyTone(months: number | null): string {
  if (months === null) return 'text-maroon';
  if (months >= 3) return 'text-maroon';
  if (months >= 2) return 'text-amber-600';
  return 'text-neutral-500';
}

/** Minutes left on a soft lock, for the "sedang diisi" hint. */
export function claimMinutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}
