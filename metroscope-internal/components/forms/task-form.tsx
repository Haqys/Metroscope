'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { z } from 'zod';

import { Stepper, WizardSection as Section } from '@/components/forms/step-wizard';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Input, PillGroup, Select, Textarea } from '@/components/ui/field';
import { ROLE_LABELS } from '@/lib/constants';

const ROLE_VALUES = ['SECRETARY', 'FINANCE', 'MENTOR', 'EDITOR'] as const;
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const schema = z.object({
  pic: z.enum(ROLE_VALUES, { required_error: 'Pilih role penanggung jawab' }),
  assignee: z.string().optional(),
  title: z.string().min(4, 'Judul tugas minimal 4 karakter'),
  description: z.string().optional(),
  due: z.date({ required_error: 'Pilih deadline', invalid_type_error: 'Pilih deadline' }),
  priority: z.enum(PRIORITY_VALUES, { required_error: 'Pilih prioritas' }),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { label: 'Pilih PIC' },
  { label: 'Detail Tugas' },
  { label: 'Deadline' },
  { label: 'Review' },
];

const STEP_FIELDS: (keyof FormValues)[][] = [['pic'], ['title'], ['due', 'priority']];

const ROLE_OPTIONS = ROLE_VALUES.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }));

const PRIORITY_OPTIONS = [
  { value: 'LOW' as const, label: 'Rendah', activeClass: 'bg-neutral-600 text-white' },
  { value: 'MEDIUM' as const, label: 'Sedang', activeClass: 'bg-sky-600 text-white' },
  { value: 'HIGH' as const, label: 'Tinggi', activeClass: 'bg-amber-500 text-white' },
  { value: 'URGENT' as const, label: 'Urgent', activeClass: 'bg-maroon text-white' },
];

/** Team members per role, dummy until `GET /users?role=` is wired. */
const MEMBERS: Record<(typeof ROLE_VALUES)[number], string[]> = {
  SECRETARY: ['Kak Sarah'],
  FINANCE: ['Kak Bima'],
  MENTOR: ['Kak Dinda', 'Kak Farrel'],
  EDITOR: ['Kak Rafi'],
};

/**
 * 4-step task delegation wizard (wireframe: Input Form 1/6, internal).
 * TODO: wire submit to `POST /tasks` (tasks module).
 */
export function TaskForm() {
  const [submitted, setSubmitted] = useState<FormValues | null>(null);
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { assignee: '', title: '', description: '' },
  });

  const values = watch();
  const stepDone = STEP_FIELDS.map((fields) =>
    fields.every((f) => schema.shape[f].safeParse(values[f]).success),
  );
  const firstIncomplete = stepDone.findIndex((d) => !d);
  const completedCount = firstIncomplete === -1 ? 3 : firstIncomplete;

  const onSubmit = async (data: FormValues) => {
    // TODO: await api.post('/tasks', data)
    await new Promise((r) => setTimeout(r, 600));
    setSubmitted(data);
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900">
          Tugas Berhasil Di-assign!
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
          <strong className="font-semibold text-neutral-800">{submitted.title}</strong> diberikan ke{' '}
          <strong className="font-semibold text-neutral-800">
            {submitted.assignee || ROLE_LABELS[submitted.pic]}
          </strong>{' '}
          dengan deadline {format(submitted.due, 'd MMMM yyyy', { locale: idLocale })}.
        </p>
        <Link
          href="/overview"
          className="bg-navy hover:bg-navy-dark mt-7 inline-block rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-colors"
        >
          Kembali ke Papan Tugas
        </Link>
      </div>
    );
  }

  const picMembers = values.pic ? MEMBERS[values.pic] : [];

  return (
    <div>
      <div className="mx-auto max-w-2xl">
        <Stepper
          steps={STEPS}
          completed={completedCount}
          active={Math.min(completedCount, 3)}
          tone="navy"
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-12">
        {/* 1. PIC */}
        <Section
          number={1}
          tone="navy"
          title="Pilih Role & Penanggung Jawab"
          subtitle="Tentukan role yang mengerjakan tugas ini"
        >
          <div className="max-w-xl space-y-5">
            <Field label="Role" error={errors.pic?.message} required>
              <Controller
                control={control}
                name="pic"
                render={({ field }) => (
                  <PillGroup
                    options={ROLE_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    label="Role penanggung jawab"
                  />
                )}
              />
            </Field>

            <Field
              label="Pilih Nama"
              hint="opsional"
              description="Kosongkan untuk membagikan ke semua anggota role tersebut."
            >
              <Select {...register('assignee')} disabled={!values.pic}>
                <option value="">
                  {values.pic ? `Semua ${ROLE_LABELS[values.pic]}` : 'Pilih role dulu'}
                </option>
                {picMembers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        {/* 2. Detail */}
        <Section
          number={2}
          tone="navy"
          title="Detail Tugas"
          subtitle="Jelaskan apa yang perlu dikerjakan"
        >
          <div className="max-w-xl space-y-5">
            <Field label="Judul Tugas" error={errors.title?.message} required>
              <Input
                placeholder="Contoh: Siapkan materi trial OSN batch 3"
                invalid={!!errors.title}
                {...register('title')}
              />
            </Field>

            <Field label="Deskripsi" hint="opsional">
              <Textarea
                rows={4}
                placeholder="Jelaskan detail tugas yang perlu dikerjakan…"
                {...register('description')}
              />
            </Field>

            <button
              type="button"
              className="hover:border-navy/40 hover:text-navy flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 transition-colors"
            >
              <Paperclip className="h-4 w-4" />
              Lampirkan File (opsional)
            </button>
          </div>
        </Section>

        {/* 3. Deadline & priority */}
        <Section
          number={3}
          tone="navy"
          title="Deadline & Prioritas"
          subtitle="Kapan tugas ini harus selesai"
        >
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Field label="Deadline" error={errors.due?.message} required>
              <Controller
                control={control}
                name="due"
                render={({ field }) => (
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    minDate={new Date()}
                    placeholder="Pilih tanggal"
                  />
                )}
              />
            </Field>

            <Field label="Prioritas" error={errors.priority?.message} required>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <PillGroup
                    size="sm"
                    options={PRIORITY_OPTIONS}
                    value={field.value}
                    onChange={field.onChange}
                    label="Prioritas tugas"
                  />
                )}
              />
            </Field>
          </div>
        </Section>

        {/* 4. Review */}
        <Section
          number={4}
          tone="navy"
          title="Review & Assign"
          subtitle="Periksa kembali sebelum dikirim"
          isLast
        >
          <div className="max-w-xl">
            <div className="rounded-2xl border border-neutral-200/70 bg-neutral-50/70 p-5">
              <p className="text-sm font-semibold text-neutral-900">
                {values.title || 'Judul tugas belum diisi'}
              </p>
              <p className="mt-1.5 text-xs text-neutral-500">
                PIC: {values.assignee || (values.pic ? `Semua ${ROLE_LABELS[values.pic]}` : '-')}
                {values.pic && ` (${ROLE_LABELS[values.pic]})`} · Deadline:{' '}
                {values.due ? format(values.due, 'd MMM yyyy', { locale: idLocale }) : '-'} ·
                Prioritas: {PRIORITY_OPTIONS.find((p) => p.value === values.priority)?.label ?? '-'}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Mengirim…' : 'Assign Tugas'}
              </button>
              <Link href="/overview" className="text-sm text-neutral-400 hover:text-neutral-700">
                Batal
              </Link>
            </div>
          </div>
        </Section>
      </form>
    </div>
  );
}
