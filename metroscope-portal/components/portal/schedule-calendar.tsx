'use client';

import {
  EventCalendar,
  type CalendarEventData,
  type CalendarTone,
} from '@/components/ui/event-calendar';
import type { SessionRow } from '@/lib/api';
import {
  ATTENDANCE_LABEL,
  KIND_LABEL,
  KIND_TONE,
  STATUS_LABEL,
  sessionRange,
} from '@/lib/session-display';

const LEGEND: { tone: CalendarTone; label: string }[] = [
  { tone: 'navy', label: KIND_LABEL.LESSON },
  { tone: 'amber', label: KIND_LABEL.ASSESSMENT },
  { tone: 'emerald', label: KIND_LABEL.CONSULTATION },
  { tone: 'neutral', label: 'Dibatalkan' },
];

/**
 * The family's timetable on the shared FullCalendar wrapper (doc 14 §3.1).
 *
 * Replaces a fixture that described July and August 2026 as a hand-built grid
 * of day numbers and month offsets, a model that could not represent any other
 * month, and rendered the same two months forever. Events now come from
 * `GET /v1/sessions`, scoped to this family by `app.owns_student()`.
 *
 * Competition deadlines used to appear here too. They return in §3.4, with a
 * table behind them.
 */
export function ScheduleCalendar({ sessions }: { sessions: SessionRow[] }) {
  /**
   * A RESCHEDULED lesson is not drawn. It was moved, and its replacement is
   * already on the calendar, showing both reads as two lessons rather than one
   * that changed date, which is how a parent misreads their week.
   *
   * Cancelled ones stay, greyed: nothing replaced them, and "why is Friday
   * empty?" is a question the calendar should answer.
   */
  const events: CalendarEventData[] = sessions
    .filter((s) => s.status !== 'RESCHEDULED')
    .map((s) => {
      const cancelled = s.status === 'CANCELLED';
      return {
        id: s.id,
        title: `${KIND_LABEL[s.type]}, ${s.studentName}`,
        start: s.startsAt,
        end: s.endsAt,
        tone: cancelled ? 'neutral' : KIND_TONE[s.type],
        badges: [
          { label: KIND_LABEL[s.type], tone: cancelled ? 'neutral' : KIND_TONE[s.type] },
          ...(cancelled ? [{ label: 'Dibatalkan', tone: 'neutral' as CalendarTone }] : []),
        ],
        fields: [
          { label: 'Siswa', value: s.studentName },
          ...(s.mentorName ? [{ label: 'Mentor', value: s.mentorName }] : []),
          { label: 'Waktu', value: sessionRange(s) },
          { label: 'Status', value: STATUS_LABEL[s.status] },
          ...(s.programName ? [{ label: 'Program', value: s.programName }] : []),
          ...(s.attendanceStatus
            ? [{ label: 'Kehadiran', value: ATTENDANCE_LABEL[s.attendanceStatus] }]
            : []),
          ...(s.cancelReason ? [{ label: 'Alasan batal', value: s.cancelReason }] : []),
        ],
        body: s.note ?? undefined,
        meetUrl: s.meetUrl ?? undefined,
      };
    });

  return (
    <EventCalendar
      events={events}
      initialView="dayGridMonth"
      views={['dayGridMonth', 'timeGridWeek', 'listMonth']}
      legend={LEGEND}
    />
  );
}
