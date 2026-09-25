'use client';

import { Video } from 'lucide-react';

import { AttendanceButton } from '@/components/internal/attendance-button';
import { EmptyState } from '@/components/ui/states';
import type { SessionRow } from '@/lib/api';
import {
  KIND_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  sessionDate,
  sessionRange,
} from '@/lib/session-display';
import { cn } from '@/lib/utils';

/**
 * The mentor's session list, read, plus the one write they own.
 *
 * No cancel button, unlike the internal app's table: cancelling needs
 * `session.manage`, which doc 13 §8.3 does not give this role. A mentor who
 * cannot teach a session tells the Secretary, who moves it; drawing a button
 * whose only outcome is a 403 would be worse than not drawing it.
 */
export function SessionTable({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="Tidak ada sesi"
        description="Sesi yang kamu pegang akan tampil di sini setelah dijadwalkan."
      />
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
      {sessions.map((session) => (
        <li key={session.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-neutral-900">
              {KIND_LABEL[session.type]}, {session.studentName}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {sessionDate(session.startsAt)} · {sessionRange(session)}
            </p>
            {session.cancelReason && (
              <p className="text-maroon mt-1 text-xs">Dibatalkan: {session.cancelReason}</p>
            )}
            {session.note && !session.cancelReason && (
              <p className="mt-1 text-xs text-neutral-400">{session.note}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {session.meetUrl && (
              <a
                href={session.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-navy inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                <Video className="h-3.5 w-3.5" />
                Meet
              </a>
            )}
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                STATUS_BADGE[session.status],
              )}
            >
              {STATUS_LABEL[session.status]}
            </span>
            <AttendanceButton session={session} />
          </div>
        </li>
      ))}
    </ul>
  );
}
