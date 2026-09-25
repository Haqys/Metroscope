'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, Trophy } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StudentProgress } from '@/lib/api';
import {
  STATUS_LABEL,
  STATUS_TONE,
  formatDate,
  lastTouchedLabel,
  percentTone,
} from '@/lib/progress-display';
import { updateProgress } from '@/lib/progress-actions';
import { formatPeriod } from '@/lib/assessment-display';

/**
 * Per-topic sliders (doc 03 FR-UPD-2, doc 14 §3.6).
 *
 * What this replaces: a four-step wizard over a student dropdown, with a
 * certificate upload that uploaded nothing and an `onSubmit` that resolved a
 * `setTimeout` and showed a success screen. FR-UPD-2 asks for the opposite,
 * *"inline per-topic slider editing; no wizard required for a routine update"*,
 * and a routine update is the whole job this screen exists for.
 *
 * **Only the sliders that moved are sent.** A whole-student save would silently
 * zero topics that were never on screen, and nothing would tell the mentor.
 *
 * **The competition result is not here.** FR-UPD-3 put it on this form when
 * this form was the only place a mentor could record anything; §3.4 gave
 * competitions a table and doc 13 §12.8 made `/competitions/[slug]` the one
 * place participants, readiness and results live. Rebuilding it here would be
 * the second source of truth that section exists to remove, so this page links
 * there instead.
 */
export function ProgressForm({ data, canEdit }: { data: StudentProgress; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ overallPercent: number | null } | null>(null);

  /** Seeded from the server; `null` (never recorded) starts the slider at 0. */
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.topics.map((t) => [t.topicId, t.percent ?? 0])),
  );

  const original = Object.fromEntries(data.topics.map((t) => [t.topicId, t.percent]));
  const moved = data.topics.filter((t) => values[t.topicId] !== (original[t.topicId] ?? 0));
  /**
   * A topic that has never been recorded counts as changed even at 0, because
   * "the mentor looked and it is still zero" is a fact worth storing. It is
   * what turns NEVER into CURRENT.
   */
  const dirty = data.topics.filter(
    (t) => values[t.topicId] !== original[t.topicId] || original[t.topicId] === null,
  );

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateProgress(
        data.student.slug,
        dirty.map((t) => ({ topicId: t.topicId, percent: values[t.topicId]! })),
      );
      if (!result.ok) {
        setError(result.error ?? 'Gagal menyimpan.');
        return;
      }
      setSaved({ overallPercent: result.data?.state?.overallPercent ?? null });
      router.refresh();
    });
  };

  if (saved) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900">
          Progress Tersimpan
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
          {data.student.name}
          {saved.overallPercent !== null ? ` · rata-rata ${saved.overallPercent}%` : ''}. Orang tua
          melihat angka ini di Portal Siswa.
        </p>
        <Link
          href="/progress"
          className="bg-navy hover:bg-navy-dark mt-7 inline-block rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-colors"
        >
          Kembali ke Papan Progress
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── context ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">{data.student.name}</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              {data.student.level ?? 'Jenjang belum diisi'}
              {data.student.programNames ? ` · ${data.student.programNames}` : ''}
            </p>
          </div>
          {data.state ? (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                STATUS_TONE[data.state.status],
              )}
            >
              {STATUS_LABEL[data.state.status]}
            </span>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-neutral-400">
          {data.state
            ? lastTouchedLabel(data.state.status, data.state.daysSinceUpdate)
            : 'Belum ada catatan'}
          {data.state?.lastUpdatedBy ? ` · oleh ${data.state.lastUpdatedBy}` : ''}
          {data.state?.lastUpdatedAt ? ` · ${formatDate(data.state.lastUpdatedAt)}` : ''}
          {' · '}
          dianggap perlu diperbarui setelah {data.staleAfterDays} hari
        </p>

        {data.mentorNote ? (
          <div className="mt-4 rounded-xl bg-neutral-50 px-4 py-3">
            <p className="text-xs text-neutral-400">
              Catatan assessment terakhir · {formatPeriod(data.mentorNote.period)}
              {data.mentorNote.author ? ` · ${data.mentorNote.author}` : ''}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600 italic">
              “{data.mentorNote.note}”
            </p>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="text-maroon rounded-xl bg-red-50 px-4 py-3 text-sm ring-1 ring-red-100 ring-inset">
          {error}
        </p>
      ) : null}

      {!canEdit ? (
        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 ring-1 ring-neutral-200 ring-inset">
          Kamu bisa membaca progress ini, tapi hanya mentor yang boleh mengubahnya.
        </p>
      ) : null}

      {/* ── the sliders ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h3 className="text-sm font-semibold text-neutral-900">Progress per Topik</h3>
        <p className="mt-0.5 text-xs text-neutral-400">
          Topik diambil dari program aktif siswa. Angka ini tampil apa adanya di portal orang tua.
        </p>

        {data.topics.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
            Program siswa ini belum punya topik. Tambahkan topik lewat halaman Materi sebelum
            progress bisa dicatat.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {data.topics.map((topic) => (
              <label key={topic.topicId} className="block">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-800">{topic.topicName}</span>
                  <span className="text-navy text-sm font-semibold">
                    {values[topic.topicId]}%
                    {topic.percent === null ? (
                      <span className="ml-1.5 text-[11px] font-normal text-neutral-400">
                        belum pernah dicatat
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={values[topic.topicId]}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [topic.topicId]: Number(e.target.value) }))
                    }
                    aria-label={topic.topicName}
                    className="accent-navy h-1.5 w-full disabled:opacity-40"
                  />
                  <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className={cn(
                        'block h-full rounded-full bg-gradient-to-r',
                        percentTone(values[topic.topicId]!),
                      )}
                      style={{ width: `${values[topic.topicId]}%` }}
                    />
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* ── competition results live elsewhere ─────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Trophy className="h-4 w-4 text-neutral-400" aria-hidden />
          Hasil Lomba
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Kesiapan dan hasil lomba dicatat di halaman lomba, bukan di sini, satu lomba, satu tempat.
        </p>
        <Link
          href="/competitions"
          className="text-navy hover:text-navy-dark mt-3 inline-block text-sm font-semibold"
        >
          Buka Database Lomba →
        </Link>
      </section>

      {canEdit && data.topics.length > 0 ? (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={pending || dirty.length === 0}
            onClick={save}
            className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {pending
              ? 'Menyimpan…'
              : dirty.length === 0
                ? 'Belum ada perubahan'
                : `Simpan ${dirty.length} topik`}
          </button>
          {moved.length > 0 ? (
            <span className="text-xs text-neutral-400">
              {moved.length} slider digeser · hanya yang berubah yang dikirim
            </span>
          ) : null}
          <Link href="/progress" className="text-sm text-neutral-400 hover:text-neutral-700">
            Batal
          </Link>
        </div>
      ) : (
        <Link href="/progress" className="text-sm text-neutral-400 hover:text-neutral-700">
          ← Kembali ke papan progress
        </Link>
      )}
    </div>
  );
}
