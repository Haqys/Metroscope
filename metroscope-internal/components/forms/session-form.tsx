'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { addWeeks, format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { AlertTriangle, CalendarCheck, Loader2, Repeat, TriangleAlert } from 'lucide-react';

import { DatePicker } from '@/components/ui/date-picker';
import { Field, PillGroup, RadioGroup, Select } from '@/components/ui/field';
import {
  checkConflicts,
  createSeries,
  createSession,
  type ConflictReport,
} from '@/lib/schedule-actions';
import type { StaffMember, StudentOption } from '@/lib/api';
import { WEEKDAYS, sessionDate, sessionTime } from '@/lib/session-display';

/** Wall-clock WITA start times, matching the slots the business actually runs. */
const TIMES = ['09:00', '10:00', '13:00', '15:00', '16:00', '19:00'];

const DURATIONS = [
  { value: '60', label: '60 menit' },
  { value: '90', label: '90 menit' },
  { value: '120', label: '120 menit' },
];

const TYPES = [
  { value: 'LESSON' as const, label: 'Les Rutin', description: 'Sesi belajar terjadwal' },
  { value: 'ASSESSMENT' as const, label: 'Assessment', description: 'Penilaian bulanan' },
  { value: 'CONSULTATION' as const, label: 'Konsultasi', description: 'Pertemuan pra-gabung' },
];

const REPEATS = [
  { value: '1', label: 'Sekali' },
  { value: '4', label: '4 minggu' },
  { value: '8', label: '8 minggu' },
  { value: '12', label: '12 minggu' },
];

type SessionKind = 'LESSON' | 'ASSESSMENT' | 'CONSULTATION';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Book a session, or a weekly series (doc 13 §12.6, doc 14 §3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This form existed with a `TODO: wire submit to POST /sessions` and a
 * `setTimeout(500)` standing in for the request. It read students from
 * `students-data.ts` and mentors from `tutors-data.ts`, so its two pickers
 * offered people who did not exist and produced ids nothing could resolve.
 *
 * Both lists are now real, and the submit goes to the real endpoint: one
 * session to `POST /sessions`, a repeat to `POST /session-series`, which
 * materialises the whole term in one transaction.
 *
 * **The conflict banner is advisory and says so.** `sessions_mentor_no_overlap`
 * is what actually prevents a double-booking, and it cannot be raced; this
 * check only tells the user before they submit. If it disagrees with the
 * database the database wins, and the 409 renders in the same place.
 */
export function SessionForm({
  students,
  mentors,
}: {
  students: StudentOption[];
  mentors: StaffMember[];
}) {
  const router = useRouter();
  const [student, setStudent] = useState('');
  const [mentor, setMentor] = useState('');
  const [type, setType] = useState<SessionKind>('LESSON');
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('90');
  const [repeat, setRepeat] = useState('4');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [checking, setChecking] = useState(false);

  const count = type === 'LESSON' ? Number(repeat) : 1;
  const lastDate = date && count > 1 ? addWeeks(date, count - 1) : undefined;
  const durationMin = Number(duration);

  /**
   * WITA, explicitly. The picker yields a local Date on the operator's machine
   * and the API wants an instant; building the string with a `+08:00` offset is
   * what makes "16.00" mean 16.00 in Denpasar rather than 16.00 wherever the
   * laptop happens to be. The same conversion the series generator does in SQL.
   */
  const startsAt =
    date && time ? new Date(`${format(date, 'yyyy-MM-dd')}T${time}:00+08:00`).toISOString() : null;

  useEffect(() => {
    if (!mentor || !startsAt) return setReport(null);
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      const result = await checkConflicts({
        mentorId: mentor,
        studentId: student || undefined,
        startsAt,
        durationMin,
      });
      if (!cancelled) {
        setReport(result);
        setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mentor, student, startsAt, durationMin]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return setError('Pilih siswa');
    if (!mentor) return setError('Pilih mentor');
    if (!date || !startsAt) return setError('Pilih tanggal mulai');
    if (!time) return setError('Pilih jam');

    setError(null);
    setSaving(true);

    const result =
      count > 1
        ? await createSeries({
            studentId: student,
            mentorId: mentor,
            weekday: date.getDay(),
            startTime: time,
            durationMin,
            startsOn: format(date, 'yyyy-MM-dd'),
            weeks: count,
          })
        : await createSession({
            studentId: student,
            mentorId: mentor,
            type,
            startsAt,
            durationMin,
          });

    setSaving(false);
    if (!result.ok) return setError(result.error ?? 'Gagal membuat jadwal.');

    /**
     * A series reports what it skipped. Eleven lessons and a note beats a
     * silent success that quietly produced one fewer than the operator counted.
     */
    const data = result.data as { created?: number; skipped?: number } | undefined;
    if (data?.skipped) {
      router.push(`/schedule?created=${data.created}&skipped=${data.skipped}`);
    } else {
      router.push('/schedule');
    }
    router.refresh();
  };

  const hardConflict = (report?.conflicts.length ?? 0) > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Siswa & Mentor</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Siswa" required>
            <Select value={student} onChange={(e) => setStudent(e.target.value)}>
              <option value="">Pilih siswa</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.level ? `, ${s.level}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Mentor" required>
            <Select value={mentor} onChange={(e) => setMentor(e.target.value)}>
              <option value="">Pilih mentor</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Jenis Sesi" required>
            <RadioGroup options={TYPES} value={type} onChange={setType} label="Jenis sesi" />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Waktu</h2>

        <div className="mt-5 space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Tanggal Mulai" required>
              <DatePicker
                value={date}
                onChange={setDate}
                minDate={new Date()}
                placeholder="Pilih tanggal"
              />
            </Field>

            <Field label="Jam mulai (WITA)" required>
              <Select value={time} onChange={(e) => setTime(e.target.value)}>
                <option value="">Pilih jam</option>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(':', '.')}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Durasi" required>
              <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {type === 'LESSON' && (
            <Field
              label="Pengulangan"
              description="Membuat sesi mingguan sekaligus, di hari & jam yang sama."
            >
              <PillGroup
                options={REPEATS}
                value={repeat}
                onChange={setRepeat}
                label="Pengulangan"
                size="sm"
              />
            </Field>
          )}

          {date && count > 1 && (
            <div className="border-navy/15 bg-navy-light/40 flex items-start gap-2.5 rounded-xl border p-4">
              <Repeat className="text-navy mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-navy text-sm">
                Akan dibuat <strong>{count} sesi</strong> tiap {WEEKDAYS[date.getDay()]}, mulai{' '}
                {format(date, 'd MMM yyyy', { locale: idLocale })} sampai{' '}
                {lastDate && format(lastDate, 'd MMM yyyy', { locale: idLocale })}. Jam yang sudah
                terisi akan dilewati.
              </p>
            </div>
          )}

          {checking && (
            <p className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Memeriksa bentrok…
            </p>
          )}

          {/* A real clash. The database will refuse it; this says so first. */}
          {hardConflict && (
            <div className="border-maroon/30 bg-maroon-light/40 flex items-start gap-2.5 rounded-xl border p-4">
              <AlertTriangle className="text-maroon mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-maroon text-sm">
                <p className="font-semibold">Jam ini sudah terisi.</p>
                <ul className="mt-1 space-y-0.5">
                  {report!.conflicts.map((c) => (
                    <li key={c.id}>
                      {c.studentName} · {sessionDate(c.startsAt)} {sessionTime(c.startsAt)}–
                      {sessionTime(c.endsAt)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* A preference, not an error, the form lets it through deliberately. */}
          {!hardConflict && report?.outsideAvailability && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50 p-4">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">
                Di luar jadwal ketersediaan mentor ini. Tetap bisa dibuat, pastikan sudah
                disepakati.
              </p>
            </div>
          )}

          {error && (
            <p className="border-maroon/30 bg-maroon-light/40 text-maroon rounded-xl border p-3 text-sm">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarCheck className="h-4 w-4" />
          )}
          {saving ? 'Menyimpan…' : count > 1 ? `Buat ${count} Sesi` : 'Buat Sesi'}
        </button>
        <Link href="/schedule" className="text-sm text-neutral-400 hover:text-neutral-700">
          Batal
        </Link>
      </div>
    </form>
  );
}
