'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { DatePicker } from '@/components/ui/date-picker';
import { Field, PillGroup, Input } from '@/components/ui/field';
import { createCompetition } from '@/lib/competition-actions';
import { FORMAT_LABEL, LEVEL_LABEL, MODE_LABEL } from '@/lib/competition-display';

/**
 * Create a competition (doc 13 §12.8, doc 14 §3.4).
 *
 * Wired as of §3.4. This form's `onSubmit` was a `setTimeout(500)` and a
 * redirect, with a `TODO: wire submit to POST /competitions` above it. Nothing
 * it collected was ever stored.
 *
 * It now asks for the LEAST that makes a usable row: a name, a deadline, and
 * the three shape fields the calendar filters on. Everything else, the
 * marketing copy, the fee, the guidebook, the venue, is edited afterwards in
 * the CMS, which is where copy belongs and which the redirect lands on. A form
 * that demanded all of it up front is how next season's lomba stays in a
 * spreadsheet until "the details are ready".
 */
const LEVELS = ['SCHOOL', 'REGIONAL', 'PROVINCIAL', 'NATIONAL', 'INTERNATIONAL'] as const;
const FORMATS = ['INDIVIDUAL', 'TEAM', 'BOTH'] as const;
const MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;
const SCHOOL_LEVELS = ['SD', 'SMP', 'SMA'] as const;

const schema = z.object({
  name: z.string().min(4, 'Nama lomba minimal 4 karakter'),
  level: z.enum(LEVELS, { required_error: 'Pilih tingkat lomba' }),
  format: z.enum(FORMATS, { required_error: 'Pilih format lomba' }),
  mode: z.enum(MODES, { required_error: 'Pilih pelaksanaan' }),
  deadline: z.date({
    required_error: 'Pilih deadline pendaftaran',
    invalid_type_error: 'Pilih deadline pendaftaran',
  }),
});

type FormValues = z.infer<typeof schema>;

const asOptions = <T extends string>(keys: readonly T[], labels: Record<T, string>) =>
  keys.map((k) => ({ value: k, label: labels[k] }));

export function CompetitionForm() {
  const router = useRouter();
  const [levels, setLevels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: '', level: 'NATIONAL', format: 'INDIVIDUAL', mode: 'OFFLINE' },
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    const result = await createCompetition({
      name: data.name,
      /**
       * The picker yields local midnight; the API stores UTC. Sending the
       * instant rather than a date string keeps one conversion point, and WITA
       * rendering happens on the way back out.
       */
      registrationDeadline: data.deadline.toISOString(),
      level: data.level,
      format: data.format,
      mode: data.mode,
      levels,
    });

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Gagal menyimpan lomba.');
      return;
    }
    /** Straight into the CMS editor, the row exists, the copy does not yet. */
    router.push(`/site/collections/competition/${result.data.id}`);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
    >
      <div className="space-y-5">
        <Field label="Nama Lomba" error={errors.name?.message} required>
          <Input
            placeholder="Olimpiade Sains Nasional 2026"
            invalid={!!errors.name}
            {...register('name')}
          />
        </Field>

        <Field label="Deadline Pendaftaran" error={errors.deadline?.message} required>
          <Controller
            control={control}
            name="deadline"
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                placeholder="Pilih tanggal"
              />
            )}
          />
        </Field>

        <Field label="Tingkat" error={errors.level?.message} required>
          <Controller
            control={control}
            name="level"
            render={({ field }) => (
              <PillGroup
                options={asOptions(LEVELS, LEVEL_LABEL)}
                value={field.value}
                onChange={field.onChange}
                label="Tingkat lomba"
                size="sm"
              />
            )}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Format" error={errors.format?.message} required>
            <Controller
              control={control}
              name="format"
              render={({ field }) => (
                <PillGroup
                  options={asOptions(FORMATS, FORMAT_LABEL)}
                  value={field.value}
                  onChange={field.onChange}
                  label="Format lomba"
                  size="sm"
                />
              )}
            />
          </Field>

          <Field label="Pelaksanaan" error={errors.mode?.message} required>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <PillGroup
                  options={asOptions(MODES, MODE_LABEL)}
                  value={field.value}
                  onChange={field.onChange}
                  label="Pelaksanaan lomba"
                  size="sm"
                />
              )}
            />
          </Field>
        </div>

        <Field label="Jenjang Peserta" hint="boleh lebih dari satu">
          <div className="flex flex-wrap gap-2">
            {SCHOOL_LEVELS.map((level) => {
              const on = levels.includes(level);
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setLevels((prev) =>
                      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
                    )
                  }
                  className={
                    on
                      ? 'bg-navy rounded-full px-4 py-2 text-sm font-semibold text-white'
                      : 'rounded-full border border-neutral-200 px-4 py-2 text-sm text-neutral-600 transition-colors hover:border-neutral-300'
                  }
                >
                  {level}
                </button>
              );
            })}
          </div>
        </Field>

        {error ? (
          <p className="text-maroon rounded-xl bg-red-50 px-4 py-3 text-sm ring-1 ring-red-100 ring-inset">
            {error}
          </p>
        ) : null}

        <p className="text-xs text-neutral-400">
          Lomba dibuat sebagai draf. Isi publiknya (deskripsi, biaya, panduan, gambar) diisi di
          langkah berikutnya, dan baru tampil di kalender publik setelah diterbitkan.
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
          >
            {isSubmitting ? 'Menyimpan…' : 'Simpan & Isi Konten'}
          </button>
          <Link href="/competitions" className="text-sm text-neutral-400 hover:text-neutral-700">
            Batal
          </Link>
        </div>
      </div>
    </form>
  );
}
