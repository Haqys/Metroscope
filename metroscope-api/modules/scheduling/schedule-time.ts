/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Scheduling time, with no dependencies at all.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A leaf module on purpose. The zone conversion is the single most testable,
 * and most silently wrong, part of the calendar integration, and it must be
 * importable by a plain Node script without dragging in the database client,
 * the logger and the Google credentials behind a `@/` alias that only Next
 * resolves. Putting it beside `calendar.service.ts` made the timezone test
 * un-runnable, which is the opposite of what a timezone test is for.
 */

/** WITA. CLAUDE.md: store UTC, render WITA. */
export const SCHEDULE_TIMEZONE = 'Asia/Makassar';

/**
 * An instant, written as wall-clock time in the scheduling zone with its
 * offset: `2026-09-18T00:30:00+08:00`.
 *
 * Google accepts `dateTime` + `timeZone`, and the two must agree or the event
 * lands in somebody's week at the wrong hour. Rather than trust a hand-written
 * `+08:00`, the parts are read back through `Intl` in the target zone and the
 * offset is derived from them, so this stays correct if the project ever
 * schedules in a zone that observes DST. WITA does not; the next one might.
 */
/**
 * Accepts whatever the driver hands back.
 *
 * `postgres` returns `timestamptz` as a STRING unless something parses it, and
 * the first version of this took `Date` and called `Intl` on the string. The
 * result was `RangeError: Invalid time value` thrown inside the outbox worker,
 * which the worker reported as a generic failure, so a Google-outage drill
 * showed the calendar message stuck rather than the real cause. Coercing here
 * is one line; discovering it through a stuck queue cost considerably more.
 */
function asDate(at: Date | string | number): Date {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`not a valid instant: ${typeof at}`);
  }
  return d;
}

export function toZonedRfc3339(
  input: Date | string | number,
  timeZone: string = SCHEDULE_TIMEZONE,
): string {
  const at = asDate(input);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  /** Some locales render midnight as hour 24; normalise it. */
  const hour = get('hour') === '24' ? '00' : get('hour');
  const local = `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;

  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(hour),
    Number(get('minute')),
    Number(get('second')),
  );
  const offsetMin = Math.round((asUtc - at.getTime()) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');

  return `${local}${sign}${hh}:${mm}`;
}

/**
 * Google Calendar's template link wants UTC basic format,
 * `20260916T060000Z`, not local wall time. Sending local time here is the
 * classic way to move every lesson by the size of the offset.
 */
export function toBasicUtc(input: Date | string | number): string {
  return asDate(input)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}
