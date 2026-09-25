'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Loader2 } from 'lucide-react';

import { withdrawReschedule } from '@/lib/reschedule-actions';
import type { RescheduleRequest } from '@/lib/api';
import { sessionDate, sessionTime } from '@/lib/session-display';

/**
 * "Kami sudah minta pindah, bagaimana?" answered on the page they ask it on.
 *
 * The wizard's confirmation screen said "tim kami akan konfirmasi" and then the
 * family had nowhere to look. A pending request is now visible on the lesson it
 * concerns, with the one action they still own: taking the question back.
 *
 * Only PENDING is rendered. A decided request has already changed the calendar,
 * an approved one moved the lesson, a rejected one left it alone, and both
 * outcomes are legible from the schedule itself plus the email. A history list
 * here would be a second place to read the same fact.
 */
export function RescheduleStatus({ request }: { request: RescheduleRequest }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    const result = await withdrawReschedule(request.id);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal membatalkan permintaan.');
    router.refresh();
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <Clock className="h-3.5 w-3.5" />
        Permintaan reschedule sedang diproses
      </p>
      {request.preferredStartsAt && (
        <p className="mt-1 text-xs text-amber-800">
          Usulan kamu: {sessionDate(request.preferredStartsAt)}{' '}
          {sessionTime(request.preferredStartsAt)}, jam final ditentukan tim.
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void withdraw()}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 underline disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        Batalkan permintaan
      </button>
      {error && <p className="text-maroon mt-1 text-xs">{error}</p>}
    </div>
  );
}
