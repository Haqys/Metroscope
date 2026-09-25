'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, X } from 'lucide-react';

import { setAvailability } from '@/lib/schedule-actions';
import type { AvailabilitySlot } from '@/lib/api';
import { WEEKDAYS } from '@/lib/session-display';

interface Slot {
  weekday: number;
  startTime: string;
  endTime: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  When I am free (doc 06 §2.3 "MentorAvailability", doc 14 §3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The mentor owns this because they are the only one who knows the answer. The
 * Secretary is the one who has to work around it, which is why
 * `mentor_availability_write` also admits `session.manage`.
 *
 * **This does not block anything.** A booking outside these hours still
 * succeeds; the Secretary simply sees a warning first. Overlapping sessions are
 * what the database refuses, a preference and an error are different things,
 * and conflating them would either let double-bookings through or make the
 * schedule unusable whenever an arrangement was made by phone.
 *
 * Sent as a whole week (PUT), not slot by slot: the editor below IS the week,
 * and a partial update cannot tell "I removed Friday" from "I did not mention
 * Friday".
 */
export function AvailabilityEditor({ initial }: { initial: AvailabilitySlot[] }) {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>(
    initial.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
    })),
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setSlots((prev) => [...prev, { weekday: 1, startTime: '16:00', endTime: '18:00' }]);
    setState('idle');
  };

  const update = (index: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...s, ...patch } : s)));
    setState('idle');
  };

  const remove = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setState('idle');
  };

  const save = async () => {
    /** The API refuses end <= start; say so here rather than showing a 422. */
    const bad = slots.find((s) => s.endTime <= s.startTime);
    if (bad) return setError(`Jam selesai harus setelah jam mulai (${WEEKDAYS[bad.weekday]}).`);

    setState('saving');
    setError(null);
    const result = await setAvailability(slots);
    if (!result.ok) {
      setState('idle');
      return setError(result.error ?? 'Gagal menyimpan.');
    }
    setState('saved');
    router.refresh();
  };

  const field =
    'focus:border-navy focus:ring-navy/20 rounded-xl border border-neutral-300 px-3 py-2 text-sm';

  return (
    <section className="rounded-2xl border border-neutral-200/70 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">
            Ketersediaan Mengajar
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Jam rutin kamu bisa mengajar. Sekretaris tetap bisa menjadwalkan di luar jam ini bila
            sudah disepakati. Ini panduan, bukan kunci.
          </p>
        </div>
        <span aria-live="polite" className="flex items-center gap-1.5 text-xs text-neutral-500">
          {state === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan…
            </>
          )}
          {state === 'saved' && (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Tersimpan
            </>
          )}
        </span>
      </div>

      <ul className="mt-5 space-y-2.5">
        {slots.length === 0 && (
          <li className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400">
            Belum ada jam ketersediaan. Tanpa ini, tidak ada peringatan apa pun saat kamu
            dijadwalkan.
          </li>
        )}
        {slots.map((slot, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={slot.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
              aria-label="Hari"
              className={field}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={slot.startTime}
              onChange={(e) => update(i, { startTime: e.target.value })}
              aria-label="Jam mulai"
              className={field}
            />
            <span className="text-sm text-neutral-400">–</span>
            <input
              type="time"
              value={slot.endTime}
              onChange={(e) => update(i, { endTime: e.target.value })}
              aria-label="Jam selesai"
              className={field}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Hapus ${WEEKDAYS[slot.weekday]}`}
              className="text-maroon rounded-full p-2 hover:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          Tambah jam
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={state === 'saving'}
          className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Simpan
        </button>
      </div>

      {error && (
        <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-3 rounded-xl border p-3 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
