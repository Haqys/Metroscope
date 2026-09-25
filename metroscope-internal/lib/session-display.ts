import type { AttendanceStatus, SessionKind, SessionRow, SessionStatus } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How a session reads on screen (doc 14 §3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A plain module with no `'use client'` directive, so the server pages and the
 * client components can both import it. §2.7 learned this the hard way: a
 * constant exported from a client module is `undefined` when a server component
 * reads it, and every collection URL 404'd while the code read correctly.
 *
 * Times are rendered in WITA everywhere. The API returns instants; the business
 * runs in Denpasar and a parent reading "16.00" means the clock on their wall.
 */

export const WITA = 'Asia/Makassar';

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: WITA,
});

const timeFmt = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: WITA,
});

export const sessionDate = (iso: string) => dateFmt.format(new Date(iso));
export const sessionTime = (iso: string) => timeFmt.format(new Date(iso)).replace(':', '.');

/** "16.00 – 17.30", the form every wireframe uses. */
export const sessionRange = (session: { startsAt: string; endsAt: string }) =>
  `${sessionTime(session.startsAt)} – ${sessionTime(session.endsAt)}`;

export const KIND_LABEL: Record<SessionKind, string> = {
  LESSON: 'Les Rutin',
  ASSESSMENT: 'Assessment',
  CONSULTATION: 'Konsultasi',
};

export const STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: 'Terjadwal',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
  NO_SHOW: 'Tidak Hadir',
  /** Not "dibatalkan", the lesson still happens, on another day. */
  RESCHEDULED: 'Dipindah',
};

export const STATUS_BADGE: Record<SessionStatus, string> = {
  SCHEDULED: 'bg-sky-100 text-sky-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-neutral-200 text-neutral-500',
  NO_SHOW: 'bg-maroon-light text-maroon',
  RESCHEDULED: 'bg-violet-50 text-violet-700',
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Hadir',
  EXCUSED: 'Izin',
  ABSENT: 'Alpa',
};

export const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  EXCUSED: 'bg-amber-100 text-amber-700',
  ABSENT: 'bg-maroon-light text-maroon',
};

/** Calendar accent per session kind, mirrors the retired fixture's palette. */
export const KIND_TONE: Record<SessionKind, 'navy' | 'amber' | 'emerald'> = {
  LESSON: 'navy',
  ASSESSMENT: 'amber',
  CONSULTATION: 'emerald',
};

export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

/** "Rabu 16.00", how a recurring rule is described everywhere it appears. */
export function seriesLabel(series: { weekday: number; startTime: string }) {
  return `${WEEKDAYS[series.weekday] ?? '-'} ${series.startTime.slice(0, 5).replace(':', '.')}`;
}

/**
 * A session is only markable once it has started.
 *
 * Marking a lesson "hadir" three hours before it begins records an observation
 * nobody has made yet, and the status it settles would be wrong until the hour
 * came round.
 */
export const isMarkable = (session: SessionRow, now = Date.now()) =>
  new Date(session.startsAt).getTime() <= now &&
  (session.status === 'SCHEDULED' || session.attendanceStatus !== null);
