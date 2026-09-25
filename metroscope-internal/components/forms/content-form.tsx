'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ImagePlus, Send } from 'lucide-react';
import { z } from 'zod';

import { Stepper, WizardSection as Section } from '@/components/forms/step-wizard';
import { Field, FileDrop, Input, PillGroup, Textarea } from '@/components/ui/field';

const TYPES = ['ARTICLE', 'PORTFOLIO', 'IG_STORY', 'ANNOUNCEMENT'] as const;

const TYPE_OPTIONS = [
  { value: 'ARTICLE' as const, label: 'Artikel' },
  { value: 'PORTFOLIO' as const, label: 'Porto Siswa' },
  { value: 'IG_STORY' as const, label: 'Story IG' },
  { value: 'ANNOUNCEMENT' as const, label: 'Pengumuman' },
];

const schema = z.object({
  type: z.enum(TYPES, { required_error: 'Pilih tipe konten' }),
  title: z.string().min(4, 'Judul minimal 4 karakter'),
  body: z.string().min(10, 'Isi konten minimal 10 karakter'),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { label: 'Pilih Tipe' },
  { label: 'Isi Konten' },
  { label: 'Upload Media' },
  { label: 'Kirim' },
];

const STEP_FIELDS: (keyof FormValues)[][] = [['type'], ['title', 'body']];

/**
 * Editor content submission (wireframe: Input Form 5/6). Everything queues for
 * Balqis' approval before going live.
 * TODO: wire submit to `POST /content` (content module).
 */
export function ContentForm() {
  const [submitted, setSubmitted] = useState<FormValues | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { title: '', body: '' },
  });

  const values = watch();
  const stepDone = STEP_FIELDS.map((fields) =>
    fields.every((f) => schema.shape[f].safeParse(values[f]).success),
  );
  const firstIncomplete = stepDone.findIndex((d) => !d);
  const completedCount = firstIncomplete === -1 ? 3 : firstIncomplete;

  const onSubmit = async (data: FormValues) => {
    // TODO: await api.post('/content', data)
    await new Promise((r) => setTimeout(r, 600));
    setSubmitted(data);
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900">
          Konten Terkirim!
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-500">
          <strong className="font-semibold text-neutral-800">{submitted.title}</strong> masuk
          antrian approval Balqis dengan status{' '}
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            Menunggu Review
          </span>
        </p>
        <Link
          href="/content-approval"
          className="bg-navy hover:bg-navy-dark mt-7 inline-block rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-colors"
        >
          Lihat Approval Konten
        </Link>
      </div>
    );
  }

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
        {/* 1. Type */}
        <Section
          number={1}
          tone="navy"
          title="Pilih Tipe Konten"
          subtitle="Menentukan ke mana konten tayang"
        >
          <div className="max-w-2xl">
            <Field error={errors.type?.message}>
              <PillGroup
                options={TYPE_OPTIONS}
                value={values.type}
                onChange={(v) => setValue('type', v, { shouldValidate: true, shouldDirty: true })}
                label="Tipe konten"
              />
            </Field>
          </div>
        </Section>

        {/* 2. Content */}
        <Section number={2} tone="navy" title="Isi Konten" subtitle="Judul dan naskah konten">
          <div className="max-w-2xl space-y-5">
            <Field label="Judul" error={errors.title?.message} required>
              <Input
                placeholder="Juara 1 OSN Kota. Aditya Pratama"
                invalid={!!errors.title}
                {...register('title')}
              />
            </Field>

            <Field label="Isi / Caption" error={errors.body?.message} required>
              <Textarea
                rows={5}
                placeholder="Selamat kepada Aditya Pratama yang berhasil meraih juara 1…"
                invalid={!!errors.body}
                {...register('body')}
              />
            </Field>
          </div>
        </Section>

        {/* 3. Media */}
        <Section number={3} tone="navy" title="Upload Media" subtitle="Foto atau video pendukung">
          <div className="max-w-md">
            <FileDrop
              label="Upload Foto / Video"
              hint="JPG/PNG/MP4 · maks 20 MB"
              icon={<ImagePlus className="h-5 w-5" />}
            />
          </div>
        </Section>

        {/* 4. Submit */}
        <Section
          number={4}
          tone="navy"
          title="Kirim untuk Approval"
          subtitle="Balqis akan meninjau sebelum tayang"
          isLast
        >
          <div className="max-w-xl">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? 'Mengirim…' : 'Kirim ke Balqis untuk Review'}
              </button>
              <Link
                href="/content-approval"
                className="text-sm text-neutral-400 hover:text-neutral-700"
              >
                Batal
              </Link>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Status akan muncul di Approval Konten: Menunggu Review.
            </p>
          </div>
        </Section>
      </form>
    </div>
  );
}
