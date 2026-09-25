'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CriterionKey, StudentAssessments } from '@/lib/api';
import {
  CATEGORY_LABEL,
  CRITERIA,
  claimMinutesLeft,
  formatPeriod,
  scoreTone,
} from '@/lib/assessment-display';
import {
  claimStudent,
  releaseClaim,
  submitAssessment,
  updateAssessment,
} from '@/lib/assessment-actions';

/**
 * The real assessment form (doc 03 FR-ASN-3..5, doc 14 §3.5).
 *
 * What this replaces: a four-step wizard over a student dropdown, three
 * hardcoded "periods" including `'Semester 1 2026'`, 0–100 sliders, and an
 * `onSubmit` that was `setTimeout(600)` followed by a success screen claiming
 * the result "sudah tampil di Portal Siswa". Nothing was stored and nothing
 * appeared anywhere. Its own comment said `TODO: wire to POST /assessments`.
 *
 * Three things changed on principle, not on taste:
 *
 * 1. **The student is not a dropdown.** The queue picks the student; this page
 *    is opened for one. A picker here would be a second way to choose, and the
 *    coverage matrix would have two front doors.
 * 2. **The scale is /10**: FR-ASV-0 settles the /10-vs-/100 contradiction that
 *    the old form was on the wrong side of.
 * 3. **The average is not computed here.** It comes back from the server, which
 *    got it from a trigger. A number rendered before submitting is a preview;
 *    the one shown afterwards is the record.
 */
const DEFAULT_SCORES: Record<CriterionKey, number> = {
  UNDERSTANDING: 7,
  PARTICIPATION: 7,
  DISCIPLINE: 7,
  READINESS: 7,
};

export function AssessmentForm({
  data,
  canSubmit,
  currentUserId,
}: {
  data: StudentAssessments;
  canSubmit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ avgScore: number; category: string } | null>(null);

  const existing = data.current;
  const [scores, setScores] = useState<Record<CriterionKey, number>>(() =>
    existing
      ? ({ ...DEFAULT_SCORES, ...existing.scores } as Record<CriterionKey, number>)
      : DEFAULT_SCORES,
  );
  const [note, setNote] = useState(existing?.note ?? '');

  /** A preview, and labelled as one, the record's average comes from the server. */
  const preview =
    Math.round((CRITERIA.reduce((sum, c) => sum + scores[c.key], 0) / CRITERIA.length) * 10) / 10;

  const heldByOther = data.claim && data.claim.claimedById !== currentUserId ? data.claim : null;
  const isAuthor = existing ? existing.mentorId === currentUserId : true;
  const noteTooShort = note.trim().length < 20;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? 'Gagal menyimpan.');
        return;
      }
      const payload = result.data as { avgScore?: number; category?: string } | undefined;
      if (payload?.avgScore !== undefined && payload.category) {
        setSaved({ avgScore: payload.avgScore, category: payload.category });
      }
      router.refresh();
    });
  };

  if (saved) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900">
          Assessment Tersimpan
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
          {data.student.name} · {formatPeriod(data.period)} ·{' '}
          <strong className="font-semibold text-neutral-800">{saved.avgScore.toFixed(1)}/10</strong>{' '}
          ({CATEGORY_LABEL[saved.category as keyof typeof CATEGORY_LABEL] ?? saved.category}).
          Hasilnya sudah tampil di Portal Siswa dan orang tua dikabari lewat email.
        </p>
        <Link
          href="/assessments"
          className="bg-navy hover:bg-navy-dark mt-7 inline-block rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-colors"
        >
          Kembali ke Antrean
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── context: who, when, and what happened last time ────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">{data.student.name}</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              {data.student.level ?? 'Jenjang belum diisi'}
              {data.student.programNames ? ` · ${data.student.programNames}` : ''}
            </p>
          </div>
          <span className="bg-navy-light text-navy rounded-full px-3 py-1 text-xs font-semibold">
            Periode {formatPeriod(data.period)}
          </span>
        </div>

        {data.previous ? (
          <div className="mt-4 rounded-xl bg-neutral-50 px-4 py-3">
            <p className="text-xs text-neutral-400">
              Assessment sebelumnya · {formatPeriod(data.previous.period)}
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              <strong className="font-semibold">{data.previous.avgScore.toFixed(1)}/10</strong> ·{' '}
              {CATEGORY_LABEL[data.previous.category]} · oleh{' '}
              {data.previous.assessorName ?? 'tim Metroscope'}
            </p>
            {data.previous.note ? (
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-neutral-500 italic">
                “{data.previous.note}”
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-neutral-200 px-4 py-3 text-xs text-neutral-400">
            Belum pernah dinilai sebelumnya. Ini assessment pertamanya.
          </p>
        )}
      </section>

      {heldByOther ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/70 ring-inset">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>{heldByOther.claimedByName ?? 'Mentor lain'}</strong> sedang mengisi assessment
            siswa ini ({claimMinutesLeft(heldByOther.claimExpiresAt)} menit lagi). Kamu masih bisa
            membaca, tapi menyimpan akan ditolak sampai kunci itu dilepas atau kedaluwarsa.
          </span>
        </p>
      ) : null}

      {!canSubmit ? (
        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 ring-1 ring-neutral-200 ring-inset">
          Kamu bisa membaca assessment ini, tapi hanya mentor yang boleh mengisinya.
        </p>
      ) : null}

      {existing && !isAuthor ? (
        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 ring-1 ring-neutral-200 ring-inset">
          Assessment ini ditulis {existing.assessorName ?? 'mentor lain'}. Hanya penulisnya yang
          bisa mengubah, kalau ada yang perlu dikoreksi, bicarakan dengan mereka.
        </p>
      ) : null}

      {error ? (
        <p className="text-maroon rounded-xl bg-red-50 px-4 py-3 text-sm ring-1 ring-red-100 ring-inset">
          {error}
        </p>
      ) : null}

      {/* ── the four criteria, /10 ─────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h3 className="text-sm font-semibold text-neutral-900">Skor per Kriteria</h3>
        <p className="mt-0.5 text-xs text-neutral-400">
          Skala 0–10. Empat kriteria ini yang tampil di portal orang tua.
        </p>

        <div className="mt-5 space-y-5">
          {CRITERIA.map((c) => (
            <label key={c.key} className="block">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-neutral-800">{c.label}</span>
                <span className="text-navy text-sm font-semibold">{scores[c.key]}/10</span>
              </span>
              <span className="mt-0.5 block text-xs text-neutral-400">{c.hint}</span>
              <span className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={scores[c.key]}
                  disabled={!canSubmit || (existing !== null && !isAuthor)}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))
                  }
                  aria-label={c.label}
                  className="accent-navy h-1.5 w-full disabled:opacity-40"
                />
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                  <span
                    className={cn(
                      'block h-full rounded-full bg-gradient-to-r',
                      scoreTone(scores[c.key]),
                    )}
                    style={{ width: `${scores[c.key] * 10}%` }}
                  />
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* ── the note ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h3 className="text-sm font-semibold text-neutral-900">
          Catatan untuk Siswa &amp; Orang Tua
        </h3>
        <p className="mt-0.5 text-xs text-neutral-400">
          Kekuatan dan area yang perlu ditingkatkan. Tampil apa adanya di portal.
        </p>
        <textarea
          rows={5}
          value={note}
          disabled={!canSubmit || (existing !== null && !isAuthor)}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Pemahaman aljabar sudah kuat dan kehadirannya konsisten. Perlu lebih banyak latihan soal cerita kompleks sebelum OSK bulan depan…"
          className="focus:border-navy mt-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none disabled:bg-neutral-50"
        />
        <p
          className={cn(
            'mt-1.5 text-xs',
            noteTooShort && note.length > 0 ? 'text-maroon' : 'text-neutral-400',
          )}
        >
          {note.trim().length} karakter · minimal 20
        </p>
      </section>

      {/* ── submit ─────────────────────────────────────────────────── */}
      {canSubmit && (!existing || isAuthor) ? (
        <section className="rounded-2xl border border-neutral-200/70 bg-neutral-50/70 p-5">
          <p className="text-sm text-neutral-700">
            Perkiraan rata-rata: <strong className="font-semibold">{preview.toFixed(1)}/10</strong>
            <span className="ml-2 text-xs text-neutral-400">
              (angka final dihitung server saat disimpan)
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Menyimpan akan menampilkan hasil di Portal Siswa, memberi +120 poin, dan mengirim email
            ke orang tua.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || noteTooShort}
              onClick={() =>
                run(() =>
                  existing
                    ? updateAssessment(existing.id, { scores, note: note.trim() })
                    : submitAssessment({
                        studentId: data.student.id,
                        period: data.period,
                        scores,
                        note: note.trim(),
                      }),
                )
              }
              className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {pending ? 'Menyimpan…' : existing ? 'Simpan Koreksi' : 'Simpan & Kirim ke Orang Tua'}
            </button>

            {!existing ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    data.claim?.claimedById === currentUserId
                      ? releaseClaim(data.student.id, data.period)
                      : claimStudent(data.student.id, data.period),
                  )
                }
                className="rounded-full border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 disabled:opacity-50"
              >
                {data.claim?.claimedById === currentUserId ? 'Lepas Klaim' : 'Klaim 24 Jam'}
              </button>
            ) : null}

            <Link href="/assessments" className="text-sm text-neutral-400 hover:text-neutral-700">
              Kembali ke antrean
            </Link>
          </div>
        </section>
      ) : (
        <div>
          <Link href="/assessments" className="text-sm text-neutral-400 hover:text-neutral-700">
            ← Kembali ke antrean
          </Link>
        </div>
      )}
    </div>
  );
}
