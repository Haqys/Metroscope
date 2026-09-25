'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Field, Input, Textarea } from '@/components/ui/field';
import { WEEKDAYS } from '@/components/internal/tutors-data';
import { cn } from '@/lib/utils';

const SLOTS = ['09.00', '10.00', '13.00', '15.00', '16.00', '17.00'];

const schema = z.object({
  fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter'),
  displayName: z.string().min(2, 'Nama panggilan wajib untuk mentor'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().min(8, 'Nomor telepon tidak valid'),
  specialization: z.string().min(3, 'Isi spesialisasi'),
  feePerSession: z.coerce.number().min(10_000, 'Fee minimal Rp 10.000'),
  bio: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Add a mentor (doc 12 §3, the button existed but had no form).
 * Creates a `User` (identity + MENTOR role) plus the `Mentor` record that holds
 * teaching data; availability is captured here so the schedule works day one.
 *
 * TODO: wire submit to `POST /tutors` (creates User + Mentor + availability).
 */
export function TutorForm() {
  const router = useRouter();
  const [availability, setAvailability] = useState<Record<number, string[]>>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      displayName: '',
      email: '',
      phone: '',
      specialization: '',
      bio: '',
    },
  });

  const toggleSlot = (day: number, slot: string) => {
    setAvailability((a) => {
      const cur = a[day] ?? [];
      return { ...a, [day]: cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot] };
    });
  };

  const totalSlots = Object.values(availability).flat().length;

  const onSubmit = async (_data: FormValues) => {
    // TODO: await api.post('/team', { ..._data, availability })
    await new Promise((r) => setTimeout(r, 500));
    router.push('/team');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {/* Identity */}
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Identitas</h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          Akun mentor dibuat sekaligus, nama panggilan & bio tampil ke orang tua.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Nama Lengkap" error={errors.fullName?.message} required>
            <Input
              placeholder="Dinda Ayu Lestari"
              invalid={!!errors.fullName}
              {...register('fullName')}
            />
          </Field>
          <Field
            label="Nama Panggilan"
            error={errors.displayName?.message}
            required
            description="Yang dilihat siswa, mis. “Kak Dinda”."
          >
            <Input
              placeholder="Kak Dinda"
              invalid={!!errors.displayName}
              {...register('displayName')}
            />
          </Field>
          <Field label="Email" error={errors.email?.message} required>
            <Input
              type="email"
              placeholder="dinda@metroscope.id"
              invalid={!!errors.email}
              {...register('email')}
            />
          </Field>
          <Field label="Telepon" error={errors.phone?.message} required>
            <Input placeholder="0812-3456-7890" invalid={!!errors.phone} {...register('phone')} />
          </Field>
        </div>

        <div className="mt-5">
          <Field
            label="Bio Publik"
            hint="opsional"
            description="Latar belakang singkat untuk orang tua."
          >
            <Textarea
              rows={3}
              placeholder="Alumni OSN, mengajar olimpiade sains sejak 2022…"
              {...register('bio')}
            />
          </Field>
        </div>
      </div>

      {/* Teaching data */}
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Data Mengajar</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Spesialisasi" error={errors.specialization?.message} required>
            <Input
              placeholder="Olimpiade Sains"
              invalid={!!errors.specialization}
              {...register('specialization')}
            />
          </Field>
          <Field label="Fee per Sesi" error={errors.feePerSession?.message} required>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="150000"
              invalid={!!errors.feePerSession}
              {...register('feePerSession')}
            />
          </Field>
        </div>
      </div>

      {/* Availability */}
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">
            Ketersediaan Jadwal
          </h2>
          <p className="text-xs text-neutral-400">{totalSlots} slot dipilih</p>
        </div>
        <p className="mt-0.5 text-xs text-neutral-400">
          Klik jam yang tersedia tiap hari. Dipakai saat menjadwalkan les.
        </p>

        <div className="mt-5 space-y-3">
          {WEEKDAYS.map((day, i) => (
            <div key={day} className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-semibold text-neutral-700">{day}</span>
              {SLOTS.map((slot) => {
                const on = (availability[i] ?? []).includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSlot(i, slot)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                      on
                        ? 'bg-navy shadow-navy/20 text-white shadow-sm'
                        : 'hover:ring-navy/40 bg-white text-neutral-500 ring-1 ring-neutral-200',
                    )}
                  >
                    {slot}
                  </button>
                );
              })}
              {(availability[i] ?? []).length === 0 && (
                <span className="text-xs text-neutral-300">libur</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        >
          {isSubmitting ? 'Menyimpan…' : 'Simpan Tutor'}
        </button>
        <Link href="/team" className="text-sm text-neutral-400 hover:text-neutral-700">
          Batal
        </Link>
      </div>
    </form>
  );
}
