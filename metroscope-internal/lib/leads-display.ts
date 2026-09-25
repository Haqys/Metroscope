import type { LeadStatus } from '@/lib/api';

/**
 * Presentation vocabulary for the lead pipeline.
 *
 * Replaces the fixture's PENDING / CONFIRMED / FOLLOW_UP, which never existed in
 * the database. The real statuses are NEW / CONSULTING / NURTURING / CONVERTED /
 * REJECTED / LOST (doc 13 §22.1), and the difference is not cosmetic: the old
 * set had no way to say "lost, and here is why", which is the single thing the
 * funnel most needed to record.
 *
 * Client-safe, no server imports, so the tables can use it.
 */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Baru Masuk',
  CONSULTING: 'Konsultasi',
  NURTURING: 'Follow Up',
  CONVERTED: 'Jadi Siswa',
  REJECTED: 'Ditolak',
  LOST: 'Hilang',
};

export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  NEW: 'bg-amber-100 text-amber-700',
  CONSULTING: 'bg-sky-100 text-sky-700',
  NURTURING: 'bg-navy-light text-navy',
  CONVERTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-neutral-200 text-neutral-500',
  LOST: 'bg-neutral-200 text-neutral-500',
};

export const LEAD_TYPE_LABEL: Record<'CONSULTATION' | 'DIRECT', string> = {
  CONSULTATION: 'Minta Konsultasi',
  DIRECT: 'Daftar Langsung',
};

export const OUTCOME_LABEL: Record<'LANJUT' | 'PIKIR_DULU' | 'TIDAK_COCOK', string> = {
  LANJUT: 'Lanjut daftar',
  PIKIR_DULU: 'Pikir-pikir dulu',
  TIDAK_COCOK: 'Tidak cocok',
};

/** Why a lead was lost. Closed set so it aggregates, free text does not. */
export const LOSS_REASON_LABEL: Record<'PRICE' | 'SCHEDULE' | 'FIT' | 'OTHER', string> = {
  PRICE: 'Biaya',
  SCHEDULE: 'Jadwal tidak cocok',
  FIT: 'Program kurang sesuai',
  OTHER: 'Lainnya',
};

/**
 * Relative time in Indonesian.
 *
 * The fixture stored strings like "2 jam lalu" as data, which meant every row
 * aged wrong the moment it was written. Real rows carry a timestamp; this is the
 * only place that turns one into words.
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '-';

  const seconds = Math.round((Date.now() - then) / 1000);
  const future = seconds < 0;
  const s = Math.abs(seconds);

  const units: Array<[number, string]> = [
    [60, 'detik'],
    [3600, 'menit'],
    [86400, 'jam'],
    [604800, 'hari'],
    [2629800, 'minggu'],
    [31557600, 'bulan'],
  ];

  let value = s;
  let unit = 'detik';
  for (let i = 0; i < units.length; i++) {
    const [limit, name] = units[i]!;
    if (s < limit) {
      const divisor = i === 0 ? 1 : units[i - 1]![0];
      value = Math.floor(s / divisor);
      unit = name;
      break;
    }
    if (i === units.length - 1) {
      value = Math.floor(s / limit);
      unit = 'tahun';
    }
  }

  if (unit === 'detik' && value < 30) return future ? 'sebentar lagi' : 'baru saja';
  return future ? `dalam ${value} ${unit}` : `${value} ${unit} lalu`;
}
