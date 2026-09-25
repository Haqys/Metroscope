import { SCHEDULE_TIMEZONE, toBasicUtc } from './schedule-time';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  "Add to Google Calendar", the half that needs no service account. (§13)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A template URL that opens Google Calendar's event composer pre-filled. It
 * puts the event in the USER's own calendar, on their own account, with one
 * click and no OAuth, which is a different thing from the server-side sync and
 * useful for exactly the reasons the sync is not:
 *
 *   · it works while the service account is unconfigured or Google's API is
 *     refusing us;
 *   · it lands in the family's personal calendar, which a shared business
 *     calendar cannot reach;
 *   · it needs no permission from anybody.
 *
 * The two must be distinguishable in the UI, or a parent adds a second copy of
 * an event they already have. The API therefore reports `calendarSync` state
 * alongside this link, and the button is labelled from it.
 */

export interface CalendarLinkInput {
  title: string;
  startsAt: Date;
  endsAt: Date;
  details?: string | null;
  location?: string | null;
  timeZone?: string;
}

export function googleCalendarLink(input: CalendarLinkInput): string {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', input.title);
  url.searchParams.set('dates', `${toBasicUtc(input.startsAt)}/${toBasicUtc(input.endsAt)}`);
  url.searchParams.set('ctz', input.timeZone ?? SCHEDULE_TIMEZONE);
  if (input.details) url.searchParams.set('details', input.details);
  if (input.location) url.searchParams.set('location', input.location);
  return url.toString();
}

/**
 * The link for one session, built from the row the scheduling API already
 * returns. Kept beside the sync so the title and description of a
 * hand-added event match the one the worker creates, a family should not be
 * able to tell which route an event took.
 */
export function sessionCalendarLink(row: {
  type: string;
  startsAt: string | Date;
  endsAt: string | Date;
  studentName?: string | null;
  mentorName?: string | null;
  programName?: string | null;
  meetUrl?: string | null;
  note?: string | null;
}): string {
  const label =
    { LESSON: 'Les', CONSULTATION: 'Konsultasi', ASSESSMENT: 'Assessment' }[row.type] ?? 'Sesi';
  const who = row.studentName ?? 'Siswa';
  const title = row.programName ? `${label} ${row.programName}, ${who}` : `${label}, ${who}`;

  const details = [
    row.programName ? `Program: ${row.programName}` : null,
    row.mentorName ? `Mentor: ${row.mentorName}` : null,
    row.note ? `Catatan: ${row.note}` : null,
    row.meetUrl ? `\nGoogle Meet: ${row.meetUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return googleCalendarLink({
    title,
    startsAt: new Date(row.startsAt),
    endsAt: new Date(row.endsAt),
    details: details || null,
    /** The Meet link is the location of an online lesson. That is where it happens. */
    location: row.meetUrl ?? null,
  });
}
