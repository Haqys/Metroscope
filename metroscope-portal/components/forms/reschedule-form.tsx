'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

import { Stepper, WizardSection as Section } from '@/components/forms/step-wizard';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DatePicker } from '@/components/ui/date-picker';
import type { SessionRow } from '@/lib/api';
import { sessionDate, sessionRange } from '@/lib/session-display';
import { requestReschedule } from '@/lib/reschedule-actions';
import { cn } from '@/lib/utils';
import { fieldBase } from '@/components/ui/field';

/** Shared control styling, see components/ui/field.tsx. */
const inputClass = `${fieldBase} h-12 py-3 border-neutral-300 focus:border-navy focus:ring-navy/20`;

const schema = z.object({
  sessionKey: z.string().min(1, 'Pilih jadwal yang ingin diubah'),
  reason: z.string().min(1, 'Pilih alasan reschedule'),
  note: z.string().optional(),
  newDate: z.date({
    required_error: 'Pilih tanggal pengganti',
    invalid_type_error: 'Pilih tanggal pengganti',
  }),
  newTime: z.string().min(1, 'Pilih jam pengganti'),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { label: 'Pilih Jadwal' },
  { label: 'Alasan' },
  { label: 'Jadwal Baru' },
  { label: 'Kirim' },
];

const STEP_FIELDS: (keyof FormValues)[][] = [['sessionKey'], ['reason'], ['newDate', 'newTime']];

const REASONS = ['Berhalangan / Ada acara keluarga', 'Sakit', 'Kegiatan sekolah', 'Lainnya'];

/** Replacement times offered by the same mentor (FR-RES-2), dummy availability. */
const AVAILABLE_TIMES = ['10.00', '13.00', '16.00'];

/**
 * Lessons still eligible for reschedule: scheduled, and at least H-1 away
 * (FR-RES-1, "ajukan maksimal H-1 sebelum jadwal berlangsung").
 *
 * The cut-off is computed from the clock now. The fixture compared a day number
 * against `TODAY = 16`, so the rule was frozen at 16 July 2026 and would have
 * offered a lesson that had already happened.
 */
function eligible(sessions: SessionRow[]): SessionRow[] {
  const cutoff = Date.now() + 24 * 60 * 60 * 1000;
  return sessions.filter(
    (s) =>
      s.status === 'SCHEDULED' && s.type === 'LESSON' && new Date(s.startsAt).getTime() >= cutoff,
  );
}

function slotLabel(values: Pick<FormValues, 'newDate' | 'newTime'>): string {
  return `${format(values.newDate, 'EEE, d MMM yyyy', { locale: idLocale })} · ${values.newTime}`;
}

/**
 * 4-step reschedule wizard (wireframe: Input Form 2/3, FR-RES-1..4).
 *
 * The requested slot is a PREFERENCE, and the confirmation screen now says so.
 * Staff decide the final time, often they cannot honour the one asked for,
 * because the mentor is teaching somebody else, and a wizard that implied
 * otherwise would make every approval at a different hour feel like a mistake.
 */
export function RescheduleForm({ sessions }: { sessions: SessionRow[] }) {
  const ELIGIBLE = eligible(sessions);
  const [submitted, setSubmitted] = useState<FormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { sessionKey: '', reason: '', note: '', newTime: '' },
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;

  const values = watch();
  const stepDone = STEP_FIELDS.map((fields) =>
    fields.every((f) => schema.shape[f].safeParse(values[f]).success),
  );
  const firstIncomplete = stepDone.findIndex((done) => !done);
  const completedCount = firstIncomplete === -1 ? 3 : firstIncomplete;

  /**
   * Real as of §3.2. This wizard has existed since the rebuild with a
   * `setTimeout(600)` where the request should be, doc 13 §12.6 calls the
   * result "the parent submits into a void", and the void was this line.
   *
   * The preferred slot is sent as an instant built with an explicit +08:00
   * offset: the picker yields a local Date on the family's device, and "16.00"
   * has to mean 16.00 in Denpasar however their phone is set.
   */
  const onSubmit = async (data: FormValues) => {
    setError(null);
    const preferred = new Date(
      `${format(data.newDate, 'yyyy-MM-dd')}T${data.newTime.replace('.', ':')}:00+08:00`,
    ).toISOString();

    const result = await requestReschedule({
      sessionId: data.sessionKey,
      reason: data.reason,
      note: data.note?.trim() || null,
      preferredStartsAt: preferred,
    });

    if (!result.ok) return setError(result.error ?? 'Gagal mengirim permintaan.');
    setSubmitted(data);
  };

  if (submitted) {
    const oldSession = ELIGIBLE.find((s) => s.id === submitted.sessionKey);
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.05)] shadow-sm">
        <CheckCircle2 className="text-navy mx-auto h-12 w-12" />
        <h2 className="mt-5 font-serif text-3xl font-medium text-neutral-900">
          Permintaan Terkirim!
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed font-light text-neutral-500">
          Reschedule dari{' '}
          <strong className="font-medium text-neutral-800">
            {oldSession ? `${sessionDate(oldSession.startsAt)} · ${sessionRange(oldSession)}` : '-'}
          </strong>{' '}
          ke <strong className="font-medium text-neutral-800">{slotLabel(submitted)}</strong> sudah
          masuk antrean tim. Kami konfirmasi lewat email, jam penggantinya ditentukan tim, dan bisa
          berbeda dari usulan di atas kalau slot itu sudah terisi.
        </p>
        <Link
          href="/portal/schedule"
          className="bg-maroon hover:bg-maroon-dark mt-7 inline-block rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-colors"
        >
          Kembali ke Jadwal Les
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-2xl">
        <Stepper steps={STEPS} completed={completedCount} active={Math.min(completedCount, 3)} />
      </div>

      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-12">
          {/* 1. Pilih jadwal */}
          <Section
            number={1}
            title="Pilih Jadwal yang Ingin Diubah"
            subtitle="Hanya jadwal H-1 ke atas yang bisa diajukan"
          >
            <div role="radiogroup" aria-label="Jadwal les" className="max-w-md space-y-2.5">
              {ELIGIBLE.length === 0 && (
                <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-400">
                  Tidak ada jadwal yang bisa diajukan. Reschedule hanya bisa diajukan paling lambat
                  H-1.
                </p>
              )}
              {ELIGIBLE.map((s) => {
                const key = s.id;
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition-colors ${
                      values.sessionKey === key
                        ? 'border-maroon bg-maroon-light/60 font-medium text-neutral-900'
                        : 'hover:border-maroon/40 border-neutral-300 text-neutral-600'
                    }`}
                  >
                    <input
                      type="radio"
                      value={key}
                      className="accent-maroon h-4 w-4"
                      {...register('sessionKey')}
                    />
                    {sessionDate(s.startsAt)} · {sessionRange(s)}
                  </label>
                );
              })}
              {errors.sessionKey && (
                <p className="text-maroon text-xs">{errors.sessionKey.message}</p>
              )}
            </div>
          </Section>

          {/* 2. Alasan */}
          <Section number={2} title="Alasan Reschedule" subtitle="Bantu kami memahami kondisimu">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                  Pilih Alasan
                </span>
                <select className={inputClass} {...register('reason')}>
                  <option value="" disabled>
                    Pilih alasan
                  </option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {errors.reason && (
                  <span className="text-maroon mt-1.5 block text-xs">{errors.reason.message}</span>
                )}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                  Catatan Tambahan (opsional)
                </span>
                <textarea
                  rows={3}
                  placeholder="Tulis catatan tambahan di sini…"
                  className={`${inputClass} resize-none`}
                  {...register('note')}
                />
              </label>
            </div>
          </Section>

          {/* 3. Jadwal pengganti */}
          <Section
            number={3}
            title="Pilih Jadwal Pengganti"
            subtitle="Pilih tanggal & jam yang tersedia dari mentor yang sama"
          >
            <div className="grid max-w-xl gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="newDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tanggal Pengganti</FormLabel>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      minDate={new Date()}
                      placeholder="Pilih tanggal"
                    />
                    <FormDescription>Pilih tanggal les pengganti.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jam Pengganti</FormLabel>
                    <div
                      className="flex flex-wrap gap-2.5"
                      role="radiogroup"
                      aria-label="Jam pengganti"
                    >
                      {AVAILABLE_TIMES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={field.value === t}
                          onClick={() => field.onChange(t)}
                          className={cn(
                            'rounded-xl px-5 py-3 text-sm font-medium transition-colors',
                            field.value === t
                              ? 'bg-maroon text-white'
                              : 'hover:ring-maroon/50 bg-white text-neutral-600 ring-1 ring-neutral-300',
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Section>

          {/* 4. Kirim */}
          <Section
            number={4}
            title="Kirim Permintaan"
            subtitle="Tim akan konfirmasi dalam 1×24 jam"
            isLast
          >
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-maroon hover:bg-maroon-dark rounded-full px-9 py-4 text-sm font-medium tracking-wide text-white transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Mengirim…' : 'Kirim Permintaan Reschedule'}
              </button>
              <p className="text-xs font-light text-neutral-400">
                Status permintaan bisa dipantau di halaman Jadwal Les.
              </p>
              {/*
                The API enforces H-1 and one-open-request-per-lesson too, so a
                stale page produces a message rather than a silent failure.
              */}
              {error && (
                <p className="border-maroon/30 bg-maroon-light/40 text-maroon w-full rounded-xl border p-3 text-sm">
                  {error}
                </p>
              )}
            </div>
          </Section>
        </form>
      </Form>
    </div>
  );
}
