import { Lightbulb } from 'lucide-react';

import type { AssessmentRecord } from '@/lib/api';
import { CATEGORY_LABEL, CRITERIA } from '@/lib/assessment-display';

import { AppreciationButtons } from './appreciation-buttons';
import { StarRating } from './star-rating';

/**
 * Structured assessment result (FR-ASV-1..5).
 *
 * Real as of §3.5, the page above it held a hardcoded object with a fixed
 * 8.1/10 and a note about a child called Aditya, shown to every family who
 * opened it.
 *
 * The criteria render from `CRITERIA`, not from whatever keys the row happens
 * to carry: the set is closed (FR-ASN-3) and rendering it in a fixed order
 * means two families comparing notes see the same four rows in the same
 * sequence. A criterion the row is missing shows as `, ` rather than vanishing,
 * because a missing score and a zero are different things.
 */
export function AssessmentView({ assessment }: { assessment: AssessmentRecord }) {
  return (
    <div>
      {/* Score hero */}
      <div className="bg-navy-dark flex flex-wrap items-center justify-between gap-6 rounded-3xl p-7 text-white sm:p-8">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.25em] text-white/50 uppercase">
            Skor Rata-rata
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <p className="font-serif text-5xl font-medium tracking-tight">
              {assessment.avgScore.toFixed(1)} <span className="text-2xl text-white/40">/ 10</span>
            </p>
            <span className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-white">
              Kategori: {CATEGORY_LABEL[assessment.category]}
            </span>
          </div>
          <div className="mt-3">
            <StarRating value={assessment.avgScore} size="h-5 w-5" />
          </div>
        </div>
        <p className="flex max-w-xs items-start gap-2.5 text-sm leading-relaxed font-medium text-amber-300">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          Assessment ini menyumbang +{assessment.pointsAwarded} poin ke Pencapaian &amp; Badge kamu
        </p>
      </div>

      {/* Criteria, star rating per criterion */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Skor per Kriteria</h2>
        <div className="mt-5 divide-y divide-neutral-100 rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
          {CRITERIA.map((c) => {
            const score = assessment.scores[c.key];
            return (
              <div
                key={c.key}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              >
                <p className="text-sm font-medium text-neutral-800">{c.label}</p>
                {score === undefined ? (
                  <span className="text-sm text-neutral-300">-</span>
                ) : (
                  <div className="flex items-center gap-3">
                    <StarRating value={score} size="h-4 w-4" />
                    <span className="text-navy w-12 text-right text-sm font-semibold">
                      {score.toFixed(1)}/10
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Mentor note */}
      {assessment.note ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
            Catatan dari Mentor
          </h2>
          <blockquote className="bg-navy-light/60 ring-navy/10 mt-4 rounded-2xl p-6 font-serif text-lg leading-relaxed text-neutral-700 italic ring-1">
            &ldquo;{assessment.note}&rdquo;
          </blockquote>
        </section>
      ) : null}

      {/* Appreciation */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
          Apresiasi Mentor (opsional)
        </h2>
        <p className="mt-1 text-sm text-neutral-400">Bantu mentor tahu feedback ini bermanfaat.</p>
        <div className="mt-4">
          <AppreciationButtons assessmentId={assessment.id} initial={assessment.reaction} />
        </div>
      </section>
    </div>
  );
}
