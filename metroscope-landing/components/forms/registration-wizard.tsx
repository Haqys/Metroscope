'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

import { Stepper, WizardSection as Section } from '@/components/forms/step-wizard';
import { ADMIN_EMAIL, REG_PREFILL_KEY } from '@/lib/constants';
import type { PublicProgram } from '@/lib/programs-api';
import { fieldBase } from '@/components/ui/field';
import { STANDALONE } from '@/lib/standalone';
import { StandaloneSubmitNotice } from '@/components/marketing/standalone-notice';

/** Shared control styling, see components/ui/field.tsx. */
const inputClass = `${fieldBase} h-12 py-3 border-neutral-300 focus:border-navy focus:ring-navy/20`;

const schema = z.object({
  registrationType: z.enum(['CONSULTATION', 'DIRECT']),
  childName: z.string().min(3, 'Nama minimal 3 karakter'),
  dob: z.string().min(1, 'Isi tanggal lahir'),
  school: z.string().min(3, 'Isi asal sekolah'),
  parentName: z.string().min(3, 'Isi nama orang tua/wali'),
  parentPhone: z.string().regex(/^08\d{8,12}$/, 'Gunakan format 08xx (10–14 digit, tanpa spasi)'),
  /**
   * Required, because everything after this form is email.
   *
   * The account, the invoice, the set-password link and every reminder go to
   * this address. WhatsApp was removed from the product (doc 08 §4). The API
   * enforces the same rule; a lead without one cannot be converted at all.
   */
  parentEmail: z.string().email('Masukkan email yang valid'),
  programId: z.string().min(1, 'Pilih satu program'),
  level: z.enum(['SD', 'SMP', 'SMA'], { message: 'Pilih level/jenjang' }),
  consultFormat: z.enum(['zoom', 'gmeet', 'offline']),
  slotDay: z.string().min(1, 'Pilih hari'),
  slotTime: z.string().min(1, 'Pilih jam'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Value is the enum the API accepts; label is what a parent reads. Keeping the
 * mapping in one place beats translating a display string at submit time.
 */
const LEVELS = [
  { value: 'SD', label: 'SD (Kelas 1–6)' },
  { value: 'SMP', label: 'SMP (Kelas 7–9)' },
  { value: 'SMA', label: 'SMA (Kelas 10–12)' },
] as const;
const DAYS = ['Sabtu', 'Minggu'];
const TIMES = ['09.00', '10.30', '13.00', '16.00'];

/** Consultation is a 1-on-1 session (min 45 min) via one of these. */
const CONSULT_FORMATS = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'gmeet', label: 'Google Meet' },
  { value: 'offline', label: 'Sesi Offline' },
] as const;

const CONSULT_FORMAT_LABEL: Record<FormValues['consultFormat'], string> = {
  zoom: 'Zoom',
  gmeet: 'Google Meet',
  offline: 'Sesi Offline',
};

/** Registration paths: free consultation first vs direct enrollment. */
const REG_TYPES = [
  {
    value: 'CONSULTATION' as const,
    title: 'Konsultasi Gratis',
    body: 'Sesi 1-on-1 (Zoom / Google Meet / Offline), minimal 45 menit, untuk menentukan program & jadwal yang pas.',
  },
  {
    value: 'DIRECT' as const,
    title: 'Daftar Langsung',
    body: 'Sudah yakin? Langsung daftar, akun & invoice pendaftaran disiapkan.',
  },
];

const STEPS = [
  { label: 'Data Anak' },
  { label: 'Pilih Program' },
  { label: 'Pilih Jadwal' },
  { label: 'Konfirmasi' },
];

/** Field groups per step, used to drive the stepper from form state. */
const STEP_FIELDS: (keyof FormValues)[][] = [
  ['childName', 'dob', 'school', 'parentName', 'parentPhone', 'parentEmail'],
  ['programId', 'level'],
  ['slotDay', 'slotTime'],
];

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-800">{label}</span>
      {children}
      {error && <span className="text-maroon mt-1.5 block text-xs">{error}</span>}
    </label>
  );
}

/**
 * 4-step registration wizard (wireframe: Input Form 1/3, FR-REG-1..7).
 * Path A = free consultation first; Path B = direct enrollment.
 *
 * Submits to `POST /api/register` on this origin, which forwards to
 * `POST /v1/public/registrations`, the same endpoint `npm run test:leads` and
 * `npm run readiness` exercise. Nothing about the funnel is special-cased for
 * the browser.
 *
 * `programs` comes from `/v1/public/programs`, the one endpoint that also feeds
 * `/programs` and every programme page (§2.5). One source, so the picker can
 * only ever offer what the site advertises, which was impossible while a
 * fixture drove the marketing pages and the picker read the database.
 */
export function RegistrationWizard({ programs }: { programs: PublicProgram[] }) {
  const searchParams = useSearchParams();
  const [submitted, setSubmitted] = useState<FormValues | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      registrationType: 'CONSULTATION',
      childName: '',
      dob: '',
      school: '',
      parentName: '',
      parentPhone: '',
      parentEmail: '',
      programId: '',
      level: undefined,
      consultFormat: 'gmeet',
      slotDay: '',
      slotTime: '',
    },
  });

  // Prefill from the program-page starter form: `?program=` in the URL,
  // name/phone via sessionStorage (consumed once, never in the URL).
  useEffect(() => {
    /**
     * The programme pages link here as `?program=<slug>`, and the picker now
     * holds ids. Match on either so those CTAs keep prefilling, silently
     * dropping the choice would make every "Daftar" button on a programme page
     * land on an empty form.
     */
    const program = searchParams.get('program');
    const matched = programs.find((p) => p.slug === program || p.id === program);
    if (matched) {
      setValue('programId', matched.id, { shouldValidate: true, shouldDirty: true });
    }
    try {
      const raw = sessionStorage.getItem(REG_PREFILL_KEY);
      if (raw) {
        const prefill = JSON.parse(raw) as { childName?: string; parentPhone?: string };
        if (prefill.childName) {
          setValue('childName', prefill.childName, { shouldValidate: true, shouldDirty: true });
        }
        if (prefill.parentPhone) {
          setValue('parentPhone', prefill.parentPhone, {
            shouldValidate: true,
            shouldDirty: true,
          });
        }
        sessionStorage.removeItem(REG_PREFILL_KEY);
      }
    } catch {
      // Corrupt/unavailable storage, start with an empty wizard.
    }
  }, [searchParams, setValue, programs]);

  const values = watch();

  // Stepper state: a step is complete when all its fields pass the schema.
  const stepDone = STEP_FIELDS.map((fields) =>
    fields.every((f) => schema.shape[f].safeParse(values[f]).success),
  );
  const completed = stepDone.findIndex((done) => !done);
  const completedCount = completed === -1 ? 3 : completed;
  const activeStep = Math.min(completedCount, 3);

  const isConsult = values.registrationType === 'CONSULTATION';
  const programName = programs.find((p) => p.id === values.programId)?.name ?? '-';
  const slotLabel =
    values.slotDay && values.slotTime ? `${values.slotDay}, ${values.slotTime}` : '-';

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);

    /**
     * Attribution (FR-LEAD-2), read from the URL the visitor actually arrived
     * on. Without it the business cannot answer "which channel produces paying
     * students?", which doc 13 §22 calls the one question it most needs.
     */
    const utm = (k: string) => searchParams.get(k) ?? undefined;

    const slot = `${data.slotDay}, ${data.slotTime}`;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: data.registrationType,
          childName: data.childName,
          dob: data.dob,
          school: data.school,
          level: data.level,
          parentName: data.parentName,
          parentPhone: data.parentPhone,
          parentEmail: data.parentEmail,
          programId: data.programId,
          preferredSlot: isConsult ? `${slot} · ${CONSULT_FORMAT_LABEL[data.consultFormat]}` : slot,
          source: utm('utm_source') ?? 'website',
          medium: utm('utm_medium'),
          campaign: utm('utm_campaign'),
          referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
          landingPage: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        /**
         * The rate limit is the one a real person actually hits, three per
         * hour per address, and "coba lagi" is useless advice for it. Say what
         * happened and give them a way through.
         */
        if (res.status === 429) {
          setSubmitError(
            ADMIN_EMAIL
              ? `Terlalu banyak pendaftaran dari koneksi ini. Coba lagi nanti, atau email kami di ${ADMIN_EMAIL}.`
              : 'Terlalu banyak pendaftaran dari koneksi ini. Coba lagi dalam satu jam.',
          );
          return;
        }
        const issue = body?.error?.details?.issues?.[0]?.message;
        setSubmitError(
          issue ?? body?.error?.message ?? 'Pendaftaran gagal terkirim. Coba lagi sebentar lagi.',
        );
        return;
      }

      setSubmitted(data);
    } catch {
      setSubmitError('Tidak bisa menghubungi server. Periksa koneksi internet, lalu coba lagi.');
    }
  };

  if (submitted) {
    const submittedProgram = programs.find((p) => p.id === submitted.programId)?.name ?? '';
    const wasConsult = submitted.registrationType === 'CONSULTATION';
    const consultFormatLabel = CONSULT_FORMAT_LABEL[submitted.consultFormat];
    const mailSubject = encodeURIComponent(
      wasConsult
        ? `Halo Admin Metroscope! Saya sudah mengirim pendaftaran konsultasi gratis 1-on-1 (${consultFormatLabel}, min 45 menit) atas nama ${submitted.childName} (${submittedProgram}, ${submitted.slotDay} ${submitted.slotTime}). Mohon info konfirmasinya ya 🙏`
        : `Halo Admin Metroscope! Saya sudah mengirim pendaftaran langsung atas nama ${submitted.childName} (${submittedProgram}, preferensi jadwal ${submitted.slotDay} ${submitted.slotTime}). Mohon info akun & invoice pendaftarannya ya 🙏`,
    );
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white p-10 text-center shadow-[0_1px_3px_rgba(16,24,40,0.05)] shadow-sm">
        <CheckCircle2 className="text-navy mx-auto h-12 w-12" />
        <h2 className="mt-5 font-serif text-3xl font-medium text-neutral-900">
          Pendaftaran Terkirim!
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed font-light text-neutral-500">
          {wasConsult ? (
            <>
              Terima kasih! {submitted.childName} terdaftar untuk konsultasi gratis 1-on-1{' '}
              <strong className="font-medium text-neutral-800">{consultFormatLabel}</strong> (min 45
              menit) untuk program{' '}
              <strong className="font-medium text-neutral-800">{submittedProgram}</strong> pada{' '}
              <strong className="font-medium text-neutral-800">
                {submitted.slotDay}, {submitted.slotTime}
              </strong>
              . Tim kami akan menghubungi untuk menjadwalkan konsultasi via email dalam 1×24 jam.
            </>
          ) : (
            <>
              Terima kasih! {submitted.childName} terdaftar langsung di{' '}
              <strong className="font-medium text-neutral-800">{submittedProgram}</strong>. Tim kami
              akan membuatkan <strong>akun</strong> dan mengirim{' '}
              <strong>invoice pendaftaran</strong> via email dalam 1×24 jam, akses portal penuh
              aktif setelah pembayaran pertama.
            </>
          )}
        </p>
        {ADMIN_EMAIL && (
          <a
            href={`mailto:${ADMIN_EMAIL}?subject=${mailSubject}`}
            className="mt-7 inline-block rounded-full bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Hubungi Admin via Email
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Registration path: free consultation first vs direct enrollment */}
      <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Tipe pendaftaran">
        {REG_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            role="radio"
            aria-checked={values.registrationType === type.value}
            onClick={() =>
              setValue('registrationType', type.value, { shouldValidate: true, shouldDirty: true })
            }
            className={`rounded-2xl border p-5 text-left transition-colors ${
              values.registrationType === type.value
                ? 'border-maroon bg-maroon-light/60 ring-maroon ring-1'
                : 'hover:border-maroon/40 border-neutral-300 bg-white'
            }`}
          >
            <p className="font-serif text-lg font-medium text-neutral-900">{type.title}</p>
            <p className="mt-1 text-sm font-light text-neutral-500">{type.body}</p>
          </button>
        ))}
      </div>

      {/* Progress stepper */}
      <div className="mx-auto mt-12 max-w-2xl">
        <Stepper steps={STEPS} completed={completedCount} active={activeStep} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-12">
        {/* 1. Data anak & orang tua (FR-REG-1) */}
        <Section
          number={1}
          title="Data Anak & Orang Tua"
          subtitle="Isi data dasar untuk pendaftaran"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nama Lengkap Anak" error={errors.childName?.message}>
              <input
                type="text"
                placeholder="Contoh: Aditya Pratama"
                autoComplete="name"
                className={inputClass}
                {...register('childName')}
              />
            </Field>
            <Field label="Tanggal Lahir" error={errors.dob?.message}>
              <input type="date" className={inputClass} {...register('dob')} />
            </Field>
            <Field label="Asal Sekolah" error={errors.school?.message}>
              <input
                type="text"
                placeholder="Contoh: SMPN 5 Jakarta"
                className={inputClass}
                {...register('school')}
              />
            </Field>
            <Field label="Nama Orang Tua / Wali" error={errors.parentName?.message}>
              <input
                type="text"
                placeholder="Contoh: Ibu Sari Pratama"
                className={inputClass}
                {...register('parentName')}
              />
            </Field>
            <Field label="Nomor Telepon Orang Tua" error={errors.parentPhone?.message}>
              <input
                type="tel"
                placeholder="08xx xxxx xxxx"
                inputMode="numeric"
                autoComplete="tel"
                className={inputClass}
                {...register('parentPhone')}
              />
            </Field>
            <Field label="Email Orang Tua" error={errors.parentEmail?.message}>
              <input
                type="email"
                placeholder="nama@email.com"
                autoComplete="email"
                className={inputClass}
                {...register('parentEmail')}
              />
              <span className="mt-1.5 block text-xs text-neutral-400">
                Akun, invoice, dan konfirmasi jadwal dikirim ke email ini.
              </span>
            </Field>
          </div>
        </Section>

        {/* 2. Pilih program (FR-REG-2: single select per wireframe) */}
        <Section
          number={2}
          title="Pilih Program Lomba"
          subtitle="Pilih satu program yang paling diminati"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div role="radiogroup" aria-label="Program lomba" className="space-y-2.5">
              {/*
                Empty when the programmes endpoint is unreachable. A form that
                cannot offer a valid programme must say so rather than submit
                something the API will reject.
              */}
              {programs.length === 0 ? (
                <p className="border-maroon/30 bg-maroon-light/40 rounded-xl border p-4 text-xs text-neutral-700">
                  Daftar program sedang tidak bisa dimuat. Muat ulang halaman
                  {ADMIN_EMAIL ? (
                    <>
                      , atau hubungi kami di{' '}
                      <a className="underline" href={`mailto:${ADMIN_EMAIL}`}>
                        {ADMIN_EMAIL}
                      </a>
                    </>
                  ) : null}
                  .
                </p>
              ) : (
                programs.map((p) => (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition-colors ${
                      values.programId === p.id
                        ? 'border-maroon bg-maroon-light/60 font-medium text-neutral-900'
                        : 'hover:border-maroon/40 border-neutral-300 text-neutral-600'
                    }`}
                  >
                    <input
                      type="radio"
                      value={p.id}
                      className="accent-maroon h-4 w-4"
                      {...register('programId')}
                    />
                    {p.name}
                  </label>
                ))
              )}
              {errors.programId && (
                <p className="text-maroon text-xs">{errors.programId.message}</p>
              )}
            </div>
            <Field label="Level / Jenjang" error={errors.level?.message}>
              <select className={inputClass} defaultValue="" {...register('level')}>
                <option value="" disabled>
                  Pilih jenjang
                </option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {/* 3. Pilih jadwal konsultasi / preferensi les (FR-REG-3/7) */}
        <Section
          number={3}
          title={isConsult ? 'Pilih Jadwal Konsultasi' : 'Pilih Preferensi Jadwal Les'}
          subtitle={
            isConsult
              ? 'Sesi 1-on-1, minimal 45 menit, pilih format & jadwal'
              : 'Jadwal les rutin akan dikonfirmasi tim kami'
          }
        >
          {isConsult && (
            <div className="mb-6">
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                Format Konsultasi
              </span>
              <div
                className="flex flex-wrap gap-2.5"
                role="radiogroup"
                aria-label="Format konsultasi"
              >
                {CONSULT_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={values.consultFormat === f.value}
                    onClick={() =>
                      setValue('consultFormat', f.value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    className={`rounded-xl px-5 py-3 text-sm font-medium transition-colors ${
                      values.consultFormat === f.value
                        ? 'bg-maroon text-white'
                        : 'hover:ring-maroon/50 bg-white text-neutral-600 ring-1 ring-neutral-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Sesi privat 1-on-1 bersama mentor · durasi minimal 45 menit.
              </p>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Pilih Hari" error={errors.slotDay?.message}>
              <select className={inputClass} {...register('slotDay')}>
                <option value="" disabled>
                  Pilih hari
                </option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">Pilih Jam</span>
              <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Jam">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={values.slotTime === t}
                    onClick={() =>
                      setValue('slotTime', t, { shouldValidate: true, shouldDirty: true })
                    }
                    className={`rounded-xl px-5 py-3 text-sm font-medium transition-colors ${
                      values.slotTime === t
                        ? 'bg-maroon text-white'
                        : 'hover:ring-maroon/50 bg-white text-neutral-600 ring-1 ring-neutral-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {errors.slotTime && (
                <p className="text-maroon mt-1.5 text-xs">{errors.slotTime.message}</p>
              )}
            </div>
          </div>
        </Section>

        {/* 4. Konfirmasi & kirim (FR-REG-4/5) */}
        <Section
          number={4}
          title="Konfirmasi & Kirim"
          subtitle="Cek kembali data sebelum dikirim"
          isLast
        >
          <dl className="grid gap-6 rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-100 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Tipe', value: isConsult ? 'Konsultasi Gratis' : 'Daftar Langsung' },
              { label: 'Nama Anak', value: values.childName || '-' },
              { label: 'Program', value: programName },
              ...(isConsult
                ? [
                    {
                      label: 'Format',
                      value: `${CONSULT_FORMAT_LABEL[values.consultFormat]} · min 45 mnt`,
                    },
                  ]
                : []),
              { label: isConsult ? 'Jadwal Konsultasi' : 'Preferensi Jadwal', value: slotLabel },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1.5 font-medium text-neutral-900">{item.value}</dd>
              </div>
            ))}
          </dl>

          {submitError && (
            <p
              role="alert"
              className="border-maroon/30 bg-maroon-light/40 text-maroon mt-6 rounded-xl border p-4 text-sm"
            >
              {submitError}
            </p>
          )}

          {STANDALONE ? (
            <StandaloneSubmitNotice
              description="Pendaftaran online belum aktif di pratinjau ini, jadi data di atas belum akan terkirim."
              mailSubject="Pendaftaran konsultasi gratis Metroscope"
              mailBody={[
                'Halo tim Metroscope, saya ingin mendaftarkan anak saya.',
                '',
                `Nama anak: ${values.childName || '-'}`,
                `Jenjang: ${values.level || '-'}`,
                `Nama orang tua: ${values.parentName || '-'}`,
                `Nomor telepon: ${values.parentPhone || '-'}`,
                `Email: ${values.parentEmail || '-'}`,
              ].join('\n')}
            />
          ) : (
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <button
                type="submit"
                disabled={isSubmitting || programs.length === 0}
                className="bg-maroon hover:bg-maroon-dark rounded-full px-10 py-4 text-sm font-medium tracking-wide text-white transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Mengirim…' : 'Kirim Pendaftaran'}
              </button>
              <p className="text-xs font-light text-neutral-400">
                Tim kami akan menghubungi via email dalam 1×24 jam.
              </p>
            </div>
          )}
        </Section>
      </form>
    </div>
  );
}
