'use client';

import {
  EventCalendar,
  type CalendarEventData,
  type CalendarTone,
} from '@/components/ui/event-calendar';
import type { CompetitionPhase, CompetitionRow } from '@/lib/api';
import {
  FORMAT_LABEL,
  LEVEL_LABEL,
  MODE_LABEL,
  PHASE_LABEL,
  formatDeadline,
  formatEventRange,
  formatFee,
} from '@/lib/competition-display';

/**
 * Info Lomba, as a deadline calendar (doc 13 §12.8).
 *
 * Real as of §3.4. This read `competition-data.ts`, three lomba hardcoded in
 * the portal that no admin screen could add to or change. It now takes the rows
 * `GET /v1/competitions` returned on the server; the same rows the internal
 * database shows and the marketing site publishes.
 *
 * The phase badge is DERIVED (`app.competition_phase`), not stored. The fixture
 * stored `status: 'Ongoing'` on every entry, which is a claim that stays true
 * for a year after registration shuts.
 */
const PHASE_TONE: Record<CompetitionPhase, CalendarTone> = {
  OPEN: 'emerald',
  UPCOMING: 'amber',
  CLOSED: 'neutral',
};

export function competitionToEvent(c: CompetitionRow): CalendarEventData {
  const badges: NonNullable<CalendarEventData['badges']> = [
    { label: PHASE_LABEL[c.phase], tone: PHASE_TONE[c.phase] },
  ];
  if (c.myTargetId) badges.push({ label: 'Kamu terdaftar', tone: 'emerald' });

  const fields: NonNullable<CalendarEventData['fields']> = [
    { label: 'Deadline', value: `${formatDeadline(c.registrationDeadline)} WITA` },
    { label: 'Biaya', value: formatFee(c.registrationFee, c.feeNote) },
    { label: 'Tingkat', value: LEVEL_LABEL[c.level] },
    { label: 'Format', value: FORMAT_LABEL[c.format] },
    { label: 'Pelaksanaan', value: MODE_LABEL[c.mode] },
  ];
  if (c.categories.length) fields.push({ label: 'Bidang', value: c.categories.join(', ') });
  if (c.levels.length) fields.push({ label: 'Jenjang', value: c.levels.join(', ') });
  if (c.organizer) fields.push({ label: 'Penyelenggara', value: c.organizer });
  if (c.venue) fields.push({ label: 'Lokasi', value: c.venue });
  const eventRange = formatEventRange(c.eventStart, c.eventEnd);
  if (eventRange) fields.push({ label: 'Tanggal lomba', value: eventRange });

  const links: NonNullable<CalendarEventData['links']> = [];
  if (c.guidebookUrl)
    links.push({ label: 'Lihat Panduan', url: c.guidebookUrl, variant: 'outline' });
  if (c.registrationUrl) {
    links.push({ label: 'Daftar Sekarang', url: c.registrationUrl, variant: 'solid' });
  }

  return {
    id: c.slug,
    title: c.name,
    /** The deadline is an instant; the calendar wants the WITA calendar day. */
    start: witaDay(c.registrationDeadline),
    allDay: true,
    tone: c.myTargetId ? 'navy' : 'maroon',
    badges,
    fields,
    body: c.description ?? c.summary ?? undefined,
    links,
  };
}

/** UTC instant → `YYYY-MM-DD` in Asia/Makassar. */
function witaDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function CompetitionCalendar({ competitions }: { competitions: CompetitionRow[] }) {
  const events = competitions.map(competitionToEvent);

  /**
   * Open on the month of the nearest deadline rather than on today. A calendar
   * that opens on an empty month reads as "no lomba" when it means "none this
   * month", and the whole point of the page is the deadline you are closest to.
   */
  const initialDate = events.length
    ? `${events
        .map((e) => String(e.start))
        .sort()[0]!
        .slice(0, 7)}-01`
    : undefined;

  return (
    <EventCalendar
      events={events}
      initialView="dayGridMonth"
      initialDate={initialDate}
      views={['dayGridMonth', 'listMonth']}
      legend={[{ tone: 'maroon', label: 'Deadline lomba, klik untuk detail & cara daftar' }]}
    />
  );
}
