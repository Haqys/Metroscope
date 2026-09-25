'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { z } from 'zod';

import { REG_PREFILL_KEY } from '@/lib/constants';
import { fieldBase } from '@/components/ui/field';
import { STANDALONE } from '@/lib/standalone';
import { StandaloneSubmitNotice } from '@/components/marketing/standalone-notice';

/** Shared control styling, see components/ui/field.tsx. */
const inputClass = `${fieldBase} h-12 py-3 border-neutral-300 focus:border-navy focus:ring-navy/20`;

const schema = z.object({
  childName: z.string().min(3, 'Nama minimal 3 karakter'),
  parentPhone: z.string().regex(/^08\d{8,12}$/, 'Gunakan format 08xx (10–14 digit, tanpa spasi)'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Program-page starter form (FR-MKT-7): a 2-field micro-commitment that
 * deep-links into the /register wizard, the single submission pipeline.
 * Name/phone travel via sessionStorage (never in the URL); only the
 * program slug goes in the query string.
 */
export function RegistrationForm({ defaultProgramSlug }: { defaultProgramSlug?: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { childName: '', parentPhone: '' },
  });

  const onSubmit = (values: FormValues) => {
    try {
      sessionStorage.setItem(REG_PREFILL_KEY, JSON.stringify(values));
    } catch {
      // Storage unavailable (private mode etc.), the wizard just starts empty.
    }
    const query = defaultProgramSlug ? `?program=${encodeURIComponent(defaultProgramSlug)}` : '';
    router.push(`/register${query}`);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-3xl border border-neutral-200/70 bg-white p-8 shadow-[0_1px_3px_rgba(16,24,40,0.05)] shadow-sm"
    >
      <h2 className="font-serif text-2xl font-medium text-neutral-900">
        Mulai Pendaftaran / Konsultasi
      </h2>
      <p className="mt-1.5 text-sm font-light text-neutral-500">
        Konsultasi pertama gratis, tanpa komitmen.
      </p>

      <div className="mt-7 space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-800">
            Nama Lengkap Anak
          </span>
          <input
            type="text"
            placeholder="Contoh: Aditya Pratama"
            autoComplete="name"
            className={inputClass}
            {...register('childName')}
          />
          {errors.childName && (
            <span className="text-maroon mt-1.5 block text-xs">{errors.childName.message}</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-800">
            Nomor Telepon Orang Tua
          </span>
          <input
            type="tel"
            placeholder="08xx xxxx xxxx"
            inputMode="numeric"
            autoComplete="tel"
            className={inputClass}
            {...register('parentPhone')}
          />
          {errors.parentPhone && (
            <span className="text-maroon mt-1.5 block text-xs">{errors.parentPhone.message}</span>
          )}
        </label>
      </div>

      {STANDALONE ? (
        <StandaloneSubmitNotice
          description="Pendaftaran online belum aktif di pratinjau ini, jadi data di atas belum akan terkirim."
          mailSubject="Konsultasi gratis Metroscope"
        />
      ) : (
        <>
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-maroon hover:bg-maroon-dark mt-7 flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-medium tracking-wide text-white transition-colors disabled:opacity-60"
          >
            Lanjut Daftar Konsultasi
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-4 text-center text-xs font-light text-neutral-400">
            Data di atas terisi otomatis di form pendaftaran, tinggal pilih jadwal.
          </p>
        </>
      )}
    </form>
  );
}
