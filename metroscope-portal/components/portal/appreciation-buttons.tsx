'use client';

import { useState, useTransition } from 'react';
import { Heart, HeartHandshake, ThumbsUp, type LucideIcon } from 'lucide-react';

import { reactToAssessment } from '@/lib/assessment-actions';
import type { AssessmentReaction } from '@/lib/api';

const REACTIONS: { key: AssessmentReaction; label: string; icon: LucideIcon }[] = [
  { key: 'HELPFUL', label: 'Membantu', icon: ThumbsUp },
  { key: 'MOTIVATING', label: 'Semangat!', icon: Heart },
  { key: 'THANKS', label: 'Terima kasih', icon: HeartHandshake },
];

/**
 * FR-ASV-4, the only feedback a family gives on an assessment.
 *
 * Real as of §3.5. This button set kept its answer in `useState` and printed
 * "Apresiasi terkirim ke mentor ✓" to a browser that had told nobody; its own
 * comment said `TODO: wire to POST /assessments/:id/reaction`. A mentor who
 * came looking for the feedback loop this exists to close would have found an
 * empty table and no way to know why.
 *
 * The selection now starts from what was actually saved, so reloading the page
 * shows the reaction rather than forgetting it.
 */
export function AppreciationButtons({
  assessmentId,
  initial,
}: {
  assessmentId: string;
  initial: AssessmentReaction | null;
}) {
  const [selected, setSelected] = useState<AssessmentReaction | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const send = (key: AssessmentReaction) => {
    const previous = selected;
    setSelected(key);
    setError(null);
    startTransition(async () => {
      const result = await reactToAssessment(assessmentId, key);
      if (!result.ok) {
        /** Put it back. A button that stays lit after a failed save is a lie. */
        setSelected(previous);
        setError(result.error ?? 'Gagal mengirim apresiasi.');
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {REACTIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={selected === r.key}
            disabled={pending}
            onClick={() => send(r.key)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              selected === r.key
                ? 'bg-navy text-white'
                : 'hover:ring-navy/50 bg-white text-neutral-700 ring-1 ring-neutral-300'
            }`}
          >
            <r.icon className="h-4 w-4" />
            {r.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-maroon mt-3 text-xs font-medium">{error}</p>
      ) : selected ? (
        <p className="mt-3 text-xs font-medium text-emerald-600">Apresiasi terkirim ke mentor ✓</p>
      ) : null}
    </div>
  );
}
