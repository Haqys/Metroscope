'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Masukkan email yang valid'),
  password: z.string().optional(),
  otp: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20';

/**
 * Sign in with email + password, or with a one-time code (FR-AUTH-1/4).
 *
 * Email only. Phone sign-in went with the WhatsApp removal (2026-07-29,
 * doc 08 §4). There is no SMS provider, so offering a phone field would be an
 * input nobody can act on.
 *
 * Every request goes to this app's own /api/auth/* routes, never to Supabase or
 * api.metroscope.id directly: the session must be written server-side into
 * HttpOnly cookies, so no token is ever readable from JavaScript (doc 04 §0.4).
 * That is also why the browser gets back a destination and nothing else.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next');

  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', otp: '' },
  });

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /**
   * A full page load, not router.push(): the destination is usually a different
   * origin (portal/internal/mentor), and the session lives in a cookie the
   * client router cannot carry across one.
   */
  const go = (url: string) => {
    window.location.href = url;
  };

  const post = async (path: string, body: unknown) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, payload: await res.json().catch(() => null) };
  };

  const sendOtp = async () => {
    if (!(await trigger('email'))) return;
    setError(null);
    setBusy(true);
    const { payload } = await post('/api/auth/otp', { email: getValues('email') });
    setBusy(false);

    // Always reported as sent, whether or not the address is registered.
    if (payload?.data?.sent) {
      setOtpSent(true);
      setCountdown(60);
      setNotice('Kalau email itu terdaftar, kodenya sudah dikirim.');
    } else {
      setError('Gagal mengirim kode. Coba lagi sebentar lagi.');
    }
  };

  const sendReset = async () => {
    if (!(await trigger('email'))) {
      setError('Isi email dulu, lalu klik "Lupa password?".');
      return;
    }
    setError(null);
    setBusy(true);
    await post('/api/auth/reset', { email: getValues('email') });
    setBusy(false);
    setNotice('Kalau email itu terdaftar, tautan reset sudah dikirim.');
  };

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setNotice(null);

    if (mode === 'password') {
      if (!values.password) {
        setError('Isi password, atau masuk dengan kode OTP.');
        return;
      }
      const { ok, payload } = await post('/api/auth/login', {
        email: values.email,
        password: values.password,
        ...(next ? { next } : {}),
      });
      if (!ok) {
        setError(payload?.error?.message ?? 'Gagal masuk. Coba lagi.');
        return;
      }
      go(payload.data.next);
      return;
    }

    if ((values.otp ?? '').length !== 6) {
      setError('Isi 6 digit kode OTP.');
      return;
    }
    const { ok, payload } = await post('/api/auth/otp/verify', {
      email: values.email,
      token: values.otp,
      ...(next ? { next } : {}),
    });
    if (!ok) {
      setError(payload?.error?.message ?? 'Kode salah atau sudah kedaluwarsa.');
      return;
    }
    go(payload.data.next);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm"
    >
      <h2 className="font-serif text-2xl font-medium text-neutral-900">Masuk ke Portal</h2>
      <p className="mt-1.5 text-sm font-light text-neutral-500">
        Gunakan email yang terdaftar di Metroscope.
      </p>

      <div className="mt-7 space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-800">Email</span>
          <input
            type="email"
            placeholder="nama@email.com"
            autoComplete="username"
            className={inputClass}
            {...register('email')}
          />
          {errors.email && (
            <span className="text-maroon mt-1.5 block text-xs">{errors.email.message}</span>
          )}
        </label>

        {mode === 'password' ? (
          <label className="block">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-800">Password</span>
              <button
                type="button"
                onClick={sendReset}
                className="text-navy text-xs font-medium hover:underline"
              >
                Lupa password?
              </button>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className={inputClass}
              {...register('password')}
            />
          </label>
        ) : (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">Kode OTP</span>
            {otpSent ? (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 digit kode"
                  autoComplete="one-time-code"
                  className={`${inputClass} tracking-[0.5em]`}
                  {...register('otp')}
                />
                <button
                  type="button"
                  disabled={countdown > 0 || busy}
                  onClick={sendOtp}
                  className="text-navy mt-2 text-xs font-medium disabled:text-neutral-400"
                >
                  {countdown > 0 ? `Kirim ulang dalam ${countdown}s` : 'Kirim ulang kode'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy}
                className="border-navy text-navy hover:bg-navy w-full rounded-xl border py-3 text-sm font-medium transition-colors hover:text-white disabled:opacity-60"
              >
                {busy ? 'Mengirim…' : 'Kirim OTP ke Email'}
              </button>
            )}
          </div>
        )}

        {notice && <p className="text-xs text-neutral-500">{notice}</p>}
        {error && <p className="text-maroon text-xs">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || busy}
        className="bg-maroon hover:bg-maroon-dark mt-7 w-full rounded-full py-4 text-sm font-medium tracking-wide text-white transition-colors disabled:opacity-60"
      >
        {isSubmitting ? 'Memproses…' : 'Masuk'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'password' ? 'otp' : 'password'));
          setError(null);
          setNotice(null);
        }}
        className="text-navy mt-4 w-full text-center text-sm font-medium hover:underline"
      >
        {mode === 'password' ? 'Masuk dengan kode OTP' : 'Masuk dengan password'}
      </button>

      <p className="mt-6 border-t border-neutral-100 pt-5 text-center text-xs text-neutral-400">
        Belum punya akun?{' '}
        <Link href="/register" className="text-maroon font-medium hover:underline">
          Konsultasi gratis
        </Link>{' '}
        , akun dibuatkan tim kami setelah pendaftaran dikonfirmasi.
      </p>
    </form>
  );
}
