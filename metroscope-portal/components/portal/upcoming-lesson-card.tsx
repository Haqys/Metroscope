import Link from 'next/link';
import { CalendarPlus, Video } from 'lucide-react';

import { RescheduleStatus } from './reschedule-status';
import type { RescheduleRequest, SessionRow } from '@/lib/api';
import {
  ATTENDANCE_BADGE,
  ATTENDANCE_LABEL,
  KIND_LABEL,
  sessionDate,
  sessionRange,
} from '@/lib/session-display';

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: 'Terjadwal', className: 'text-emerald-600' },
  DONE: { label: 'Selesai', className: 'text-neutral-400' },
  NO_SHOW: { label: 'Tidak hadir', className: 'text-maroon' },
  CANCELLED: { label: 'Dibatalkan', className: 'text-maroon' },
};

/**
 * One lesson card on the parent's timetable (doc 14 §3.1).
 *
 * The "Tersinkron Google Calendar" badge came back, but it now reads
 * `calendarSyncStatus` from the server instead of asserting a sync that never
 * happened. It says "Tersinkron" only for SYNCED; a lesson still waiting says
 * so, and one whose sync failed says nothing at all rather than lying to the
 * parent checking where their child should be.
 *
 * **"Tambah ke Google Calendar" is a different thing and is always offered.**
 * The badge is about the school's shared calendar, a family cannot see it. The
 * button puts the lesson in their OWN calendar, needs no service account, and
 * works when the integration is unconfigured or Google is refusing us.
 *
 * The Meet button now renders only when the session actually has a link. It
 * used to be a hardcoded `meet.google.com/abc-defg-hij` on every card.
 */
export function UpcomingLessonCard({
  session,
  pendingRequest,
}: {
  session: SessionRow;
  pendingRequest?: RescheduleRequest;
}) {
  const badge = STATUS_BADGES[session.status] ?? STATUS_BADGES.SCHEDULED!;
  const isActionable = session.status === 'SCHEDULED';

  return (
    <div className="rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-100 transition-shadow hover:shadow-sm">
      <p className="font-semibold text-neutral-900">
        {sessionDate(session.startsAt)} · {sessionRange(session)}
      </p>
      <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${badge.className}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        {badge.label}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {session.studentName}
        {session.mentorName && ` · Mentor: ${session.mentorName}`}
        {session.programName && ` · ${session.programName}`}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400">{KIND_LABEL[session.type]}</p>
      {isActionable && session.calendarSyncStatus === 'SYNCED' && (
        <p className="mt-1 text-xs text-neutral-400">Tersinkron ke Google Calendar sekolah</p>
      )}
      {isActionable && session.calendarSyncStatus === 'PENDING' && (
        <p className="mt-1 text-xs text-neutral-400">Menunggu sinkron ke Google Calendar…</p>
      )}
      {session.cancelReason && (
        <p className="text-maroon mt-1 text-xs">Dibatalkan: {session.cancelReason}</p>
      )}
      {session.note && !session.cancelReason && (
        <p className="mt-1 text-xs text-neutral-400 italic">{session.note}</p>
      )}

      {session.attendanceStatus && (
        <span
          className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${ATTENDANCE_BADGE[session.attendanceStatus]}`}
        >
          {ATTENDANCE_LABEL[session.attendanceStatus]}
        </span>
      )}

      {isActionable && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {session.meetUrl && (
            <a
              href={session.meetUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <Video className="h-3.5 w-3.5" />
              Gabung Meet
            </a>
          )}
          {/*
            Always offered, whatever the school calendar is doing. This is the
            family's own calendar, and `addToCalendarUrl` is built by the API
            from the lesson itself, no date is assembled in the browser, so a
            reschedule cannot leave a stale link behind.
          */}
          <a
            href={session.addToCalendarUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-neutral-400"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Tambah ke Google Calendar
          </a>
          {/* One open request per lesson, asking twice is refused by the API. */}
          {!pendingRequest && (
            <Link
              href="/portal/schedule/reschedule"
              className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-neutral-400"
            >
              Ajukan Reschedule
            </Link>
          )}
        </div>
      )}

      {pendingRequest && <RescheduleStatus request={pendingRequest} />}
    </div>
  );
}
