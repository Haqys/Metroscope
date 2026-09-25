/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Denda, the late fee (FR-PAY-6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The requirement asks for exactly this: "Config lives in one helper (`lateFee`)
 * so the rate/grace is tunable." One home, so a change to the rate cannot land
 * in the job and miss the portal, or vice versa.
 *
 *   • 7-day grace after the due date, no fee at all.
 *   • From day 8: (daysPastDue − 7) × Rp5.000.
 *   • day 8 → Rp5.000, day 9 → Rp10.000, day 10 → Rp15.000, and so on.
 *
 * Integer IDR throughout (CLAUDE.md). No rounding, no floats, a fee that
 * arrives with a fractional rupiah cannot be transferred.
 */
export const LATE_FEE_CONFIG = {
  /** Days after the due date with no fee. */
  graceDays: 7,
  /** Added per day once the grace has passed. */
  perDayIdr: 5_000,
} as const;

/**
 * Whole days past the due date, in WITA.
 *
 * The business day matters, not the instant: an invoice due "10 August" is not
 * late at 00:30 WITA on the 11th by a few minutes. It is one day late, and a
 * parent in Denpasar would say the same. Comparing UTC timestamps would make
 * the fee tick over at 08:00 local, which nobody expects.
 */
export function daysPastDue(dueDate: string | Date, now: Date = new Date()): number {
  const toWitaDay = (d: Date) => {
    // WITA is UTC+8 with no DST, so a fixed shift is exact here.
    const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  };

  const due =
    typeof dueDate === 'string'
      ? // A bare YYYY-MM-DD is already a calendar day; parsing it as UTC and
        // shifting would move it into the previous day.
        (() => {
          const [y, m, d] = dueDate.slice(0, 10).split('-').map(Number);
          return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
        })()
      : toWitaDay(dueDate);

  return Math.round((toWitaDay(now) - due) / 86_400_000);
}

/** The denda for an invoice this many days past due. Never negative. */
export function lateFee(daysLate: number): number {
  const chargeable = daysLate - LATE_FEE_CONFIG.graceDays;
  if (chargeable <= 0) return 0;
  return chargeable * LATE_FEE_CONFIG.perDayIdr;
}

/** Everything the portal needs to explain the number (FR-PAY-6). */
export interface LateFeeBreakdown {
  daysLate: number;
  /** Days actually charged, days late minus the grace, floored at zero. */
  chargeableDays: number;
  perDayIdr: number;
  fee: number;
  total: number;
}

export function lateFeeBreakdown(
  amount: number,
  dueDate: string | Date,
  now?: Date,
): LateFeeBreakdown {
  const daysLate = daysPastDue(dueDate, now);
  const chargeableDays = Math.max(daysLate - LATE_FEE_CONFIG.graceDays, 0);
  const fee = lateFee(daysLate);
  return {
    daysLate,
    chargeableDays,
    perDayIdr: LATE_FEE_CONFIG.perDayIdr,
    fee,
    total: amount + fee,
  };
}
