'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';

import { EmptyState } from '@/components/ui/states';
import { approveReschedule, rejectReschedule } from '@/lib/schedule-actions';
import type { RescheduleRequest } from '@/lib/api';
import { sessionDate, sessionTime } from '@/lib/session-display';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-maroon-light text-maroon',
  WITHDRAWN: 'bg-neutral-200 text-neutral-500',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  WITHDRAWN: 'Dibatalkan keluarga',
};

/**
 * Convert an instant to the `datetime-local` value the input wants, in WITA.
 *
 * `toISOString().slice(0,16)` would be the UTC wall clock, 08:00 for a lesson
 * at 16.00, so the Secretary would be shown a time eight hours off and would
 * "correct" it. Formatting parts in the business's own zone is the only version
 * of this that is right.
 */
function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** …and back. The value carries no zone, so WITA has to be stated. */
const fromLocalInput = (value: string) => new Date(`${value}:00+08:00`).toISOString();

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Deciding a reschedule request (doc 13 §12.6, doc 14 §3.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This screen is what closes "the parent submits into a void". The request has
 * had a table since §3.2 and a place in `/inbox`; this is where a human answers
 * it.
 *
 * The time field is PRE-FILLED with what the family asked for and is fully
 * editable, which is the whole design. The reason a person is in this loop at
 * all is that the preferred slot is often taken, approving at a different hour
 * is the normal case, not an exception, and the family is told the actual time
 * by email either way.
 *
 * A clash is refused by the database, so the 409 renders here as a message
 * rather than being something this component tries to prevent.
 */
export function RescheduleQueue({ requests }: { requests: RescheduleRequest[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) {
    return (
      <EmptyState
        title="Tidak ada permintaan"
        description="Permintaan reschedule dari orang tua akan muncul di sini dan di /inbox."
      />
    );
  }

  const start = (request: RescheduleRequest, next: 'approve' | 'reject') => {
    setOpen(open === request.id && mode === next ? null : request.id);
    setMode(next);
    setWhen(toLocalInput(request.preferredStartsAt ?? request.sessionStartsAt));
    setNote('');
    setError(null);
  };

  const submit = async (request: RescheduleRequest) => {
    setBusy(true);
    setError(null);

    const result =
      mode === 'approve'
        ? await approveReschedule(request.id, {
            startsAt: fromLocalInput(when),
            note: note.trim() || null,
          })
        : await rejectReschedule(request.id, note.trim());

    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal menyimpan.');
    setOpen(null);
    router.refresh();
  };

  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
      {requests.map((request) => (
        <li key={request.id} className="px-5 py-4">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900">{request.studentName}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {sessionDate(request.sessionStartsAt)} · {sessionTime(request.sessionStartsAt)}
                {request.mentorName && ` · ${request.mentorName}`}
              </p>
              <p className="mt-1.5 text-sm text-neutral-700">{request.reason}</p>
              {request.note && <p className="mt-0.5 text-xs text-neutral-500">{request.note}</p>}
              {request.preferredStartsAt && (
                <p className="mt-1 text-xs text-neutral-400">
                  Usulan keluarga: {sessionDate(request.preferredStartsAt)}{' '}
                  {sessionTime(request.preferredStartsAt)}
                </p>
              )}
              {request.status === 'APPROVED' && request.newStartsAt && (
                <p className="mt-1 text-xs text-emerald-700">
                  Dipindah ke {sessionDate(request.newStartsAt)} {sessionTime(request.newStartsAt)}
                </p>
              )}
              {request.decisionNote && (
                <p className="mt-1 text-xs text-neutral-500">Catatan: {request.decisionNote}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  STATUS_BADGE[request.status],
                )}
              >
                {STATUS_LABEL[request.status]}
              </span>
              {request.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    onClick={() => start(request, 'approve')}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Setujui
                  </button>
                  <button
                    type="button"
                    onClick={() => start(request, 'reject')}
                    className="text-maroon inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    <X className="h-3.5 w-3.5" />
                    Tolak
                  </button>
                </>
              )}
            </div>
          </div>

          {open === request.id && (
            <div className="mt-3 rounded-xl bg-neutral-50 p-4">
              {mode === 'approve' ? (
                <>
                  <label
                    htmlFor={`when-${request.id}`}
                    className="text-xs font-medium text-neutral-700"
                  >
                    Jadwal pengganti (WITA)
                  </label>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Terisi dengan usulan keluarga. Ubah bila slot itu sudah terpakai. Mereka diberi
                    tahu jam finalnya lewat email.
                  </p>
                  <input
                    id={`when-${request.id}`}
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="focus:border-navy focus:ring-navy/20 mt-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </>
              ) : (
                <label
                  htmlFor={`note-${request.id}`}
                  className="text-xs font-medium text-neutral-700"
                >
                  Alasan penolakan, dikirim ke keluarga
                </label>
              )}

              <input
                id={mode === 'reject' ? `note-${request.id}` : undefined}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  mode === 'approve'
                    ? 'Catatan (opsional)'
                    : 'Mentor tidak ada slot lain minggu ini'
                }
                className="focus:border-navy focus:ring-navy/20 mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || (mode === 'reject' && note.trim().length < 3)}
                  onClick={() => void submit(request)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
                    mode === 'approve' ? 'bg-emerald-600' : 'bg-maroon',
                  )}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {mode === 'approve' ? 'Setujui & pindahkan' : 'Tolak permintaan'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="text-sm text-neutral-400 hover:text-neutral-700"
                >
                  Batal
                </button>
              </div>

              {error && (
                <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-3 rounded-xl border p-3 text-sm">
                  {error}
                </p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
