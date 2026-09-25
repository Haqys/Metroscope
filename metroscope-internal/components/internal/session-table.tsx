'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, Video } from 'lucide-react';

import { AttendanceButton } from '@/components/internal/attendance-button';
import { EmptyState } from '@/components/ui/states';
import { cancelSession } from '@/lib/schedule-actions';
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
 * The session list beside the calendar (doc 13 §7.2, "/schedule = calendar +
 * session list + conflict detection").
 *
 * A calendar cannot show status, attendance and a cancellation reason at a
 * glance, which is why the wireframe has both. This is the operational half:
 * one row per session, with the two actions staff actually take on one, mark
 * who turned up, or call it off with a reason.
 *
 * `canManage` only decides what is DRAWN. Every action re-checks server-side
 * and RLS checks again underneath, so a button rendered in error produces a 403
 * the user can read rather than a state change.
 */
export function SessionTable({
  sessions,
  canManage,
  emptyHint,
}: {
  sessions: SessionRow[];
  canManage: boolean;
  emptyHint?: string;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="Belum ada jadwal"
        description={emptyHint ?? 'Jadwal yang dibuat akan tampil di sini.'}
      />
    );
  }

  const confirm = async (id: string) => {
    if (reason.trim().length < 3) return setError('Tulis alasan pembatalan.');
    setBusy(true);
    setError(null);
    const result = await cancelSession(id, reason.trim());
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal membatalkan.');
    setCancelling(null);
    setReason('');
    router.refresh();
  };

  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
      {sessions.map((session) => (
        <li key={session.id} className="px-5 py-4">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-neutral-900">
                {KIND_LABEL[session.type]}, {session.studentName}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {sessionDate(session.startsAt)} · {sessionRange(session)}
                {session.mentorName && ` · ${session.mentorName}`}
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
              {canManage && session.status === 'SCHEDULED' && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelling(cancelling === session.id ? null : session.id);
                    setReason('');
                    setError(null);
                  }}
                  className="text-maroon inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Batalkan
                </button>
              )}
            </div>
          </div>

          {/*
            The reason is required by the API, so it is asked for here rather
            than sent as an empty string, a cancellation nobody explained is a
            mystery to whoever reads the record three weeks later.
          */}
          {cancelling === session.id && (
            <div className="mt-3 rounded-xl bg-neutral-50 p-3">
              <label
                htmlFor={`reason-${session.id}`}
                className="text-xs font-medium text-neutral-700"
              >
                Alasan pembatalan
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <input
                  id={`reason-${session.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mentor sakit, siswa izin, …"
                  className="focus:border-navy focus:ring-navy/20 min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirm(session.id)}
                  className="bg-maroon inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Batalkan sesi
                </button>
              </div>
              {error && <p className="text-maroon mt-2 text-xs">{error}</p>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
