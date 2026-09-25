'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cn } from '@/lib/utils';
import type { CompetitionParticipant, CompetitionResult } from '@/lib/api';
import { RESULT_LABEL, RESULT_TONE, readinessTone } from '@/lib/competition-display';
import { updateTarget } from '@/lib/competition-actions';

/**
 * Record readiness and a result (doc 13 §8.3, a Mentor's key action).
 *
 * The number this writes, `readiness_pct`, is the one `/schedule`'s sidebar
 * printed from a fixture from the very beginning; that fixture's own comment
 * admitted "there are no competition targets, so nothing computes it". A mentor
 * typing here is what computes it.
 *
 * There is no participant-adding control and no team editor: entering a student
 * is `student.edit`, which a mentor does not hold. Offering the button would be
 * offering a 403.
 */
const RESULTS: CompetitionResult[] = ['PENDING', 'WINNER', 'FINALIST', 'PARTICIPANT', 'WITHDRAWN'];

export function CompetitionRecorder({
  competitionId,
  participants,
}: {
  competitionId: string;
  participants: CompetitionParticipant[];
}) {
  const [error, setError] = useState<string | null>(null);

  if (participants.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
        Belum ada siswa yang didaftarkan ke lomba ini. Pendaftaran peserta dilakukan tim
        sekretariat.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-maroon rounded-xl bg-red-50 px-4 py-3 text-sm ring-1 ring-red-100 ring-inset">
          {error}
        </p>
      ) : null}
      {participants.map((p) => (
        <ParticipantCard
          key={p.id}
          competitionId={competitionId}
          participant={p}
          onError={setError}
        />
      ))}
    </div>
  );
}

function ParticipantCard({
  competitionId,
  participant: p,
  onError,
}: {
  competitionId: string;
  participant: CompetitionParticipant;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [readiness, setReadiness] = useState(p.readinessPct);
  const [result, setResult] = useState<CompetitionResult>(p.result);
  const [award, setAward] = useState(p.award ?? '');

  const dirty = readiness !== p.readinessPct || result !== p.result || award !== (p.award ?? '');

  const save = () => {
    onError(null);
    start(async () => {
      const outcome = await updateTarget(competitionId, p.id, {
        readinessPct: readiness,
        result,
        award: award.trim() === '' ? null : award.trim(),
      });
      if (!outcome.ok) onError(outcome.error ?? 'Gagal menyimpan.');
      else router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{p.studentName}</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {p.level ?? 'Jenjang belum diisi'}
            {p.teamName ? ` · ${p.teamName}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
            RESULT_TONE[p.result],
          )}
        >
          {RESULT_LABEL[p.result]}
          {p.award ? ` · ${p.award}` : ''}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs text-neutral-400">Kesiapan, {readiness}%</span>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={readiness}
              onChange={(e) => setReadiness(Number(e.target.value))}
              className="accent-navy h-1.5 w-full"
              aria-label={`Kesiapan ${p.studentName}`}
            />
            <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={cn('h-full rounded-full bg-gradient-to-r', readinessTone(readiness))}
                style={{ width: `${readiness}%` }}
              />
            </div>
          </div>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-neutral-400">Hasil</span>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as CompetitionResult)}
              className="focus:border-navy mt-1.5 w-44 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none"
            >
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-neutral-400">Juara / medali</span>
            <input
              value={award}
              onChange={(e) => setAward(e.target.value)}
              placeholder="Juara 2"
              className="focus:border-navy mt-1.5 w-36 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none"
            />
          </label>

          <button
            type="button"
            disabled={pending || !dirty}
            onClick={save}
            className="bg-navy hover:bg-navy-dark rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
