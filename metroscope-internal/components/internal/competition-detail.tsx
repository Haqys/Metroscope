'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  CompetitionDetail,
  CompetitionParticipant,
  CompetitionResult,
  StudentOption,
} from '@/lib/api';
import {
  FORMAT_LABEL,
  LEVEL_LABEL,
  MODE_LABEL,
  PHASE_LABEL,
  PHASE_TONE,
  RESULT_LABEL,
  RESULT_TONE,
  daysUntil,
  formatDeadline,
  formatEventRange,
  formatFee,
  readinessTone,
} from '@/lib/competition-display';
import {
  addParticipant,
  addTeamMember,
  createTeam,
  deleteTeam,
  removeParticipant,
  removeTeamMember,
  updateTarget,
} from '@/lib/competition-actions';

/**
 * `/competitions/[slug]`, doc 13 §12.8's four asks on one screen:
 * "participants, teams, readiness distribution, deadline checklist".
 *
 * The two write paths are visibly different because the authorities are
 * different: entering and withdrawing a student is `student.edit` (Secretary),
 * recording readiness and a result is `progress.edit` (Mentor). Neither is
 * checked here, the API and RLS both check, so a role holding one and not the
 * other sees the other's control fail with the API's own sentence. That is the
 * honest rendering of a permission you do not hold; hiding the button would
 * leave someone wondering why the screen looks different from a colleague's.
 */

const RESULTS: CompetitionResult[] = ['PENDING', 'WINNER', 'FINALIST', 'PARTICIPANT', 'WITHDRAWN'];

export function CompetitionDetailView({
  detail,
  students,
}: {
  detail: CompetitionDetail;
  students: StudentOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { competition: c, participants, teams, distribution } = detail;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'Gagal menyimpan.');
      else router.refresh();
    });
  };

  const entered = new Set(participants.map((p) => p.studentId));
  const available = students.filter((s) => !entered.has(s.id));
  const days = daysUntil(c.registrationDeadline);

  return (
    <div className="space-y-8">
      {error ? (
        <p className="text-maroon rounded-xl bg-red-50 px-4 py-3 text-sm ring-1 ring-red-100 ring-inset">
          {error}
        </p>
      ) : null}

      {/* ── the record ─────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)] lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-900">{c.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {LEVEL_LABEL[c.level]} · {FORMAT_LABEL[c.format]} · {MODE_LABEL[c.mode]}
              </p>
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                PHASE_TONE[c.phase],
              )}
            >
              {PHASE_LABEL[c.phase]}
            </span>
          </div>

          {c.summary ? <p className="mt-4 text-sm text-neutral-600">{c.summary}</p> : null}

          <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="Penyelenggara" value={c.organizer} />
            <Fact label="Lokasi" value={c.venue} />
            <Fact label="Biaya" value={formatFee(c.registrationFee, c.feeNote)} />
            <Fact label="Jenjang" value={c.levels.length ? c.levels.join(' · ') : null} />
            <Fact label="Pelaksanaan" value={formatEventRange(c.eventStart, c.eventEnd)} />
            <Fact
              label="Panduan"
              value={
                c.guidebookUrl ? (
                  <a
                    href={c.guidebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-navy underline underline-offset-2"
                  >
                    Buka panduan
                  </a>
                ) : null
              }
            />
          </dl>
        </div>

        {/* ── deadline checklist ───────────────────────────────────── */}
        <div className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
          <h3 className="text-sm font-semibold text-neutral-900">Checklist Deadline</h3>
          <p
            className={cn(
              'mt-2 text-2xl font-semibold',
              days < 0 ? 'text-neutral-400' : days <= 7 ? 'text-maroon' : 'text-neutral-900',
            )}
          >
            {days < 0 ? 'Lewat' : days === 0 ? 'Hari ini' : `${days} hari`}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Deadline {formatDeadline(c.registrationDeadline)} WITA
          </p>

          <ul className="mt-4 space-y-2.5 text-sm">
            <Checkpoint done={c.status === 'PUBLISHED'} label="Terbit di kalender publik" />
            <Checkpoint done={c.targetCount > 0} label={`Peserta terdaftar (${c.targetCount})`} />
            <Checkpoint
              done={c.format === 'INDIVIDUAL' || c.teamCount > 0}
              label={
                c.format === 'INDIVIDUAL'
                  ? 'Lomba individu, tim tidak perlu'
                  : `Tim dibentuk (${c.teamCount})`
              }
            />
            <Checkpoint done={Boolean(c.guidebookUrl)} label="Panduan lomba terlampir" />
            <Checkpoint
              done={participants.length > 0 && participants.every((p) => p.readinessPct >= 75)}
              label="Semua peserta kesiapan ≥ 75%"
            />
          </ul>
        </div>
      </section>

      {/* ── readiness distribution ─────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h3 className="text-sm font-semibold text-neutral-900">Sebaran Kesiapan</h3>
        <p className="mt-0.5 text-xs text-neutral-400">
          Empat kelompok, dihitung di database, setiap layar menggambar batas yang sama.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Bucket label="0–24%" count={distribution.b0} total={c.targetCount} tone="bg-maroon" />
          <Bucket
            label="25–49%"
            count={distribution.b25}
            total={c.targetCount}
            tone="bg-amber-400"
          />
          <Bucket label="50–74%" count={distribution.b50} total={c.targetCount} tone="bg-sky-400" />
          <Bucket
            label="75–100%"
            count={distribution.b75}
            total={c.targetCount}
            tone="bg-emerald-500"
          />
        </div>
      </section>

      {/* ── participants ───────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">
            Peserta <span className="text-neutral-400">({participants.length})</span>
          </h3>
          <AddParticipant
            students={available}
            disabled={pending}
            onAdd={(studentId) => run(() => addParticipant(c.id, studentId))}
          />
        </div>

        <div className="mt-4 space-y-3">
          {participants.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
              Belum ada siswa yang didaftarkan ke lomba ini.
            </p>
          ) : (
            participants.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                disabled={pending}
                onSave={(patch) => run(() => updateTarget(c.id, p.id, patch))}
                onRemove={() => run(() => removeParticipant(c.id, p.id))}
              />
            ))
          )}
        </div>
      </section>

      {/* ── teams ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">
            Tim <span className="text-neutral-400">({teams.length})</span>
          </h3>
          <AddTeam disabled={pending} onCreate={(name) => run(() => createTeam(c.id, { name }))} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {teams.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400 md:col-span-2">
              Belum ada tim. Siswa harus terdaftar sebagai peserta sebelum bisa dimasukkan ke tim.
            </p>
          ) : (
            teams.map((team) => (
              <div
                key={team.id}
                className="rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
                      <Users className="h-3.5 w-3.5 text-neutral-400" />
                      {team.name}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {team.mentorName ? `Mentor: ${team.mentorName}` : 'Belum ada mentor'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteTeam(c.id, team.id))}
                    className="hover:text-maroon rounded-lg p-1.5 text-neutral-300 transition-colors disabled:opacity-40"
                    aria-label={`Bubarkan ${team.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {team.members.map((m) => (
                    <li
                      key={m.studentId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate text-neutral-700">
                        {m.studentName}
                        {m.role === 'LEADER' ? (
                          <span className="bg-navy-light text-navy ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                            Ketua
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => removeTeamMember(c.id, team.id, m.studentId))}
                        className="hover:text-maroon text-xs text-neutral-300 transition-colors disabled:opacity-40"
                      >
                        keluarkan
                      </button>
                    </li>
                  ))}
                  {team.members.length === 0 ? (
                    <li className="text-xs text-neutral-300">Belum ada anggota.</li>
                  ) : null}
                </ul>

                <AddMember
                  disabled={pending}
                  /** Only participants, the composite FK refuses anybody else anyway. */
                  candidates={participants.filter(
                    (p) => !teams.some((t) => t.members.some((m) => m.studentId === p.studentId)),
                  )}
                  hasLeader={team.members.some((m) => m.role === 'LEADER')}
                  onAdd={(studentId, role) =>
                    run(() => addTeamMember(c.id, team.id, { studentId, role }))
                  }
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-neutral-800">
        {value ?? <span className="text-neutral-300">-</span>}
      </dd>
    </div>
  );
}

function Checkpoint({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
          done ? 'bg-emerald-500' : 'bg-neutral-200',
        )}
        aria-hidden
      >
        {done ? '✓' : ''}
      </span>
      <span className={cn('text-sm', done ? 'text-neutral-600' : 'text-neutral-400')}>{label}</span>
    </li>
  );
}

function Bucket({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-neutral-400">{label}</span>
        <span className="text-sm font-semibold text-neutral-900">{count}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={cn('fx-bar-x h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ParticipantRow({
  participant: p,
  disabled,
  onSave,
  onRemove,
}: {
  participant: CompetitionParticipant;
  disabled: boolean;
  onSave: (patch: { readinessPct?: number; result?: string; award?: string | null }) => void;
  onRemove: () => void;
}) {
  const [readiness, setReadiness] = useState(p.readinessPct);
  const [result, setResult] = useState<CompetitionResult>(p.result);
  const [award, setAward] = useState(p.award ?? '');

  const dirty = readiness !== p.readinessPct || result !== p.result || award !== (p.award ?? '');

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
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
              RESULT_TONE[p.result],
            )}
          >
            {RESULT_LABEL[p.result]}
            {p.award ? ` · ${p.award}` : ''}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="hover:text-maroon rounded-lg p-1.5 text-neutral-300 transition-colors disabled:opacity-40"
            aria-label={`Keluarkan ${p.studentName}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
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

        <label className="block">
          <span className="text-xs text-neutral-400">Hasil</span>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as CompetitionResult)}
            className="focus:border-navy mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none sm:w-44"
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
            className="focus:border-navy mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none sm:w-36"
          />
        </label>

        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() =>
            onSave({
              readinessPct: readiness,
              result,
              award: award.trim() === '' ? null : award.trim(),
            })
          }
          className="bg-navy hover:bg-navy-dark rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        >
          Simpan
        </button>
      </div>
    </div>
  );
}

function AddParticipant({
  students,
  disabled,
  onAdd,
}: {
  students: StudentOption[];
  disabled: boolean;
  onAdd: (studentId: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="focus:border-navy rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none"
        aria-label="Pilih siswa"
      >
        <option value="">Pilih siswa…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.level ? ` (${s.level})` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
        className="bg-navy hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
        Daftarkan
      </button>
    </div>
  );
}

function AddTeam({ disabled, onCreate }: { disabled: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama tim"
        className="focus:border-navy rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none"
        aria-label="Nama tim"
      />
      <button
        type="button"
        disabled={disabled || name.trim().length < 2}
        onClick={() => {
          onCreate(name.trim());
          setName('');
        }}
        className="bg-navy hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
        Buat Tim
      </button>
    </div>
  );
}

function AddMember({
  candidates,
  hasLeader,
  disabled,
  onAdd,
}: {
  candidates: CompetitionParticipant[];
  hasLeader: boolean;
  disabled: boolean;
  onAdd: (studentId: string, role: 'LEADER' | 'MEMBER') => void;
}) {
  const [value, setValue] = useState('');
  const [role, setRole] = useState<'LEADER' | 'MEMBER'>('MEMBER');

  if (candidates.length === 0) {
    return <p className="mt-3 text-xs text-neutral-300">Semua peserta sudah punya tim.</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="focus:border-navy flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs focus:outline-none"
        aria-label="Tambah anggota"
      >
        <option value="">Tambah anggota…</option>
        {candidates.map((p) => (
          <option key={p.studentId} value={p.studentId}>
            {p.studentName}
          </option>
        ))}
      </select>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as 'LEADER' | 'MEMBER')}
        className="focus:border-navy rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs focus:outline-none"
        aria-label="Peran"
      >
        <option value="MEMBER">Anggota</option>
        {/* One leader per team is a partial unique index; offering a second is offering an error. */}
        <option value="LEADER" disabled={hasLeader}>
          Ketua
        </option>
      </select>
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => {
          onAdd(value, role);
          setValue('');
          setRole('MEMBER');
        }}
        className="text-navy hover:bg-navy-light rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
      >
        Tambah
      </button>
    </div>
  );
}
