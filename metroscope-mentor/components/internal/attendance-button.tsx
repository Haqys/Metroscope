'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

import { markAttendance } from '@/lib/schedule-actions';
import type { AttendanceStatus, SessionRow } from '@/lib/api';
import { ATTENDANCE_BADGE, ATTENDANCE_LABEL, isMarkable } from '@/lib/session-display';
import { cn } from '@/lib/utils';

const OPTIONS: AttendanceStatus[] = ['PRESENT', 'EXCUSED', 'ABSENT'];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Marking who turned up (doc 13 §8.3, "attendance has no UI at all today").
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The blueprint lists this under the Mentor role as a "Fix required", and calls
 * the model "a screen with no UI". Three buttons is the whole screen: the
 * decision is one of three values, and a dialog with a save button would add a
 * step to something a mentor does six times a day.
 *
 * Marking also CLOSES the session, the `session_attendance_settles` trigger
 * moves it to DONE, or to NO_SHOW for an absence. The button does not send that
 * status and must not: the rule belongs in one place, and §3.1 found out what
 * happens when the client is trusted to keep two facts in step.
 */
export function AttendanceButton({ session }: { session: SessionRow }) {
  const router = useRouter();
  const [pending, setPending] = useState<AttendanceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isMarkable(session)) {
    return session.attendanceStatus ? (
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
          ATTENDANCE_BADGE[session.attendanceStatus],
        )}
      >
        {ATTENDANCE_LABEL[session.attendanceStatus]}
      </span>
    ) : (
      /* A lesson that has not started yet cannot be observed. */
      <span className="text-xs text-neutral-400">-</span>
    );
  }

  const mark = async (status: AttendanceStatus) => {
    setPending(status);
    setError(null);
    const result = await markAttendance(session.id, status);
    setPending(null);
    if (!result.ok) return setError(result.error ?? 'Gagal menyimpan.');
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => {
          const active = session.attendanceStatus === option;
          return (
            <button
              key={option}
              type="button"
              disabled={pending !== null}
              onClick={() => void mark(option)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50',
                active
                  ? ATTENDANCE_BADGE[option]
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
              )}
            >
              {pending === option ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : active ? (
                <Check className="h-3 w-3" />
              ) : null}
              {ATTENDANCE_LABEL[option]}
            </button>
          );
        })}
      </div>
      {error && <p className="text-maroon mt-1 text-[11px]">{error}</p>}
    </div>
  );
}
