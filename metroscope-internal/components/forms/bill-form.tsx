'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Receipt, Send } from 'lucide-react';
import { z } from 'zod';

import { DatePicker } from '@/components/ui/date-picker';
import { Field, Input, RadioGroup, Select, Switch } from '@/components/ui/field';
import type { StudentOption } from '@/lib/api';

const TYPES = ['REGISTRATION', 'MONTHLY', 'COMPETITION', 'MATERIAL', 'EXTRA'] as const;

const TYPE_OPTIONS = [
  { value: 'MONTHLY' as const, label: 'Bulanan', description: 'Iuran rutin bulanan' },
  { value: 'REGISTRATION' as const, label: 'Pendaftaran', description: 'Biaya gabung' },
  { value: 'COMPETITION' as const, label: 'Biaya Lomba', description: 'Pendaftaran kompetisi' },
  { value: 'MATERIAL' as const, label: 'Materi Tambahan', description: 'Modul berbayar' },
  { value: 'EXTRA' as const, label: 'Lainnya', description: 'Tagihan khusus' },
];

const PERIODS = ['Juli 2026', 'Agustus 2026', 'September 2026'];

const schema = z.object({
  studentSlug: z.string().min(1, 'Pilih siswa'),
  type: z.enum(TYPES, { required_error: 'Pilih jenis tagihan' }),
  amount: z.coerce
    .number({ invalid_type_error: 'Nominal harus angka' })
    .min(1000, 'Nominal minimal Rp 1.000'),
  period: z.string().min(1, 'Pilih periode'),
  dueDate: z.date({
    required_error: 'Pilih jatuh tempo',
    invalid_type_error: 'Pilih jatuh tempo',
  }),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function idr(n: number | string): string {
  const v = Number(n);
  return Number.isFinite(v) ? `Rp ${v.toLocaleString('id-ID')}` : '-';
}

/**
 * **Buat Tagihan**: issues a bill the parent pays online (transfer + upload proof).
 *
 * Deliberately separate from "Catat Pembayaran" (`/finance/payments/new`), which
 * records money already received offline. Mixing the two in one form conflated
 * *billing* with *settlement*.
 *
 * TODO: wire submit to `POST /invoices` + email notification.
 */
export function BillForm({ students }: { students: StudentOption[] }) {
  const router = useRouter();
  const [notify, setNotify] = useState(true);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { studentSlug: '', type: 'MONTHLY', period: '', note: '' },
  });

  const values = watch();
  const student = students.find((s) => s.slug === values.studentSlug);
  const amountOk = schema.shape.amount.safeParse(values.amount).success;

  const onSubmit = async (_data: FormValues) => {
    // TODO: await api.post('/invoices', { ..._data, notify })
    await new Promise((r) => setTimeout(r, 500));
    router.push('/finance/invoices');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Untuk Siapa</h2>

        <div className="mt-5">
          <Field label="Siswa" error={errors.studentSlug?.message} required>
            <Select invalid={!!errors.studentSlug} {...register('studentSlug')}>
              <option value="">Pilih siswa</option>
              {students.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.level ? `${s.name}, ${s.level}` : s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Detail Tagihan</h2>

        <div className="mt-5 space-y-5">
          <Field label="Jenis Tagihan" error={errors.type?.message} required>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <RadioGroup
                  options={TYPE_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  label="Jenis tagihan"
                  columns={2}
                />
              )}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nominal" error={errors.amount?.message} required>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="850000"
                invalid={!!errors.amount}
                {...register('amount')}
              />
            </Field>

            <Field label="Periode" error={errors.period?.message} required>
              <Select invalid={!!errors.period} {...register('period')}>
                <option value="">Pilih periode</option>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="Jatuh Tempo"
            error={errors.dueDate?.message}
            required
            description="Lewat tanggal ini tagihan otomatis berstatus Nunggak."
          >
            <Controller
              control={control}
              name="dueDate"
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

          <Field label="Catatan untuk Orang Tua" hint="opsional">
            <Input placeholder="Mis. biaya pendaftaran OSK Matematika 2026" {...register('note')} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Ringkasan</h2>

        <div className="mt-4 rounded-xl border border-neutral-200/70 bg-neutral-50/70 p-5">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-900">
            <Receipt className="text-navy h-4 w-4" />
            {student?.name ?? 'Siswa belum dipilih'} · {amountOk ? idr(values.amount) : '-'}
          </p>
          <p className="mt-1.5 text-xs text-neutral-500">
            {TYPE_OPTIONS.find((t) => t.value === values.type)?.label} · {values.period || '-'} ·
            jatuh tempo{' '}
            {values.dueDate ? format(values.dueDate, 'd MMM yyyy', { locale: idLocale }) : '-'}
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Orang tua membayar via transfer lalu mengunggah bukti di portal. Status jadi{' '}
            <strong className="font-semibold">Lunas</strong> setelah diverifikasi Finance.
          </p>
        </div>

        <div className="mt-5">
          <Switch
            checked={notify}
            onChange={setNotify}
            label="Kirim tagihan ke orang tua via email"
            description="Berisi nominal, jatuh tempo, dan tautan pembayaran."
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {isSubmitting ? 'Menerbitkan…' : 'Terbitkan Tagihan'}
        </button>
        <Link href="/finance/invoices" className="text-sm text-neutral-400 hover:text-neutral-700">
          Batal
        </Link>
      </div>
    </form>
  );
}
