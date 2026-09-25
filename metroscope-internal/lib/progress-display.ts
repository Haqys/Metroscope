import type { PayStatus, ProgressStatus } from '@/lib/api';
export { formatIdr } from '@/lib/format';

/**
 * How progress reads on screen (doc 03 FR-UPD-1, doc 14 §3.6).
 *
 * **No date arithmetic lives here.** `daysSinceUpdate` and `status` arrive
 * computed by `app.days_since_wita()` and `app.progress_status()`; this module
 * only turns them into Indonesian. A `Math.floor((Date.now() - t) / 86400000)`
 * in a component would put the business rule in four places and make the answer
 * depend on the reader's clock, two people looking at the same board would see
 * different numbers.
 */

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  NEVER: 'Belum pernah diupdate',
  STALE: 'Perlu diperbarui',
  CURRENT: 'Terkini',
};

export const STATUS_TONE: Record<ProgressStatus, string> = {
  NEVER: 'bg-maroon-light text-maroon ring-maroon/20',
  STALE: 'bg-amber-50 text-amber-700 ring-amber-200',
  CURRENT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/** "16 hari lalu", the number is the server's; only the words are ours. */
export function lastTouchedLabel(status: ProgressStatus, days: number | null): string {
  if (status === 'NEVER' || days === null) return 'Belum ada catatan';
  if (days === 0) return 'Diperbarui hari ini';
  if (days === 1) return 'Kemarin';
  return `${days} hari lalu`;
}

export const PAY_LABEL: Record<PayStatus, string> = {
  LUNAS: 'Lunas',
  BELUM_BAYAR: 'Belum Bayar',
  CICILAN: 'Cicilan',
  NUNGGAK: 'Nunggak',
};

export const PAY_TONE: Record<PayStatus, string> = {
  LUNAS: 'bg-emerald-100 text-emerald-700',
  BELUM_BAYAR: 'bg-neutral-100 text-neutral-600',
  CICILAN: 'bg-amber-100 text-amber-700',
  NUNGGAK: 'bg-maroon-light text-maroon',
};

/** The same three bands the progress bars use, so colour never argues with label. */
export function percentTone(pct: number): string {
  if (pct >= 75) return 'from-emerald-400 to-emerald-500';
  if (pct >= 50) return 'from-navy to-navy-dark';
  if (pct >= 25) return 'from-amber-400 to-amber-500';
  return 'from-maroon to-maroon/70';
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  });
}
