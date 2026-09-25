'use client';

import { useState } from 'react';
import { Check, CalendarDays, ShieldCheck } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20';

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)] sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
      <p className="mt-1 text-sm font-light text-neutral-500">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * Keamanan akun.
 *
 * Three controls used to live here and none of them did anything:
 *
 *   · **Ubah Password** validated the fields and stopped, under a
 *     `TODO: POST /auth/reset`. It said "Password diperbarui" either way, so
 *     somebody rotating a password they thought was compromised still had the
 *     old one. It now posts to `/api/auth/password` on this origin, which
 *     re-authenticates with the current password before changing anything.
 *
 *   · **Akun Terhubung → Google** was a button that flipped a boolean in local
 *     state and claimed "jadwal les tersinkron ke Google Calendar". No OAuth
 *     flow exists, and building one is not merely unfinished work, it is
 *     explicitly ruled out: the calendar integration is a SERVICE ACCOUNT on a
 *     shared business calendar, and `lib/google/credentials.ts` names "a fake
 *     Connect Google flow" as the thing that must not be built. The card now
 *     explains what actually happens, and points at the per-session "Tambah ke
 *     Google Calendar" link that has worked all along.
 *
 *   · **Sesi Aktif** listed two invented devices, one of them "Safari ·
 *     iPhone … Jakarta", and its "Keluar" buttons filtered a local array.
 *     GoTrue does not expose per-device sessions to a client, so the list
 *     cannot be truthful. What it CAN do is end every session everywhere, and
 *     that is the control somebody worried about a lost phone actually wants.
 */
export function SecuritySettings() {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  /** Same resolution the sidebar's logout uses. Login lives on the landing site. */
  const landing = process.env.NEXT_PUBLIC_LANDING_URL ?? 'http://localhost:3004';

  const savePassword = async () => {
    if (!pw.current) return setPwError('Isi password saat ini.');
    if (pw.next.length < 8) return setPwError('Password baru minimal 8 karakter.');
    if (pw.next !== pw.confirm) return setPwError('Konfirmasi password tidak sama.');
    setPwError(null);
    setPwSaving(true);

    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        setPwError(payload?.error?.message ?? 'Gagal mengubah password.');
        return;
      }

      setPw({ current: '', next: '', confirm: '' });
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 4000);
    } catch {
      setPwError('Tidak bisa menghubungi server. Coba lagi.');
    } finally {
      setPwSaving(false);
    }
  };

  /**
   * Ends the session with GoTrue, not just in this browser, and the cookie is
   * shared across all four surfaces, so it signs the person out everywhere.
   */
  const signOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await fetch(`${landing}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = `${landing}/login`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Change password */}
      <Card title="Ubah Password" subtitle="Gunakan minimal 8 karakter; hindari tanggal lahir.">
        <div className="max-w-sm space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">
              Password Saat Ini
            </span>
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              autoComplete="current-password"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">Password Baru</span>
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">
              Konfirmasi Password Baru
            </span>
            <input
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          {pwError && <p className="text-maroon text-xs">{pwError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={savePassword}
              disabled={pwSaving}
              className="bg-navy hover:bg-navy-dark rounded-full px-7 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60"
            >
              {pwSaving ? 'Menyimpan…' : 'Ubah Password'}
            </button>
            {pwSaved && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Password diperbarui
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Google Calendar, described honestly */}
      <Card title="Google Calendar" subtitle="Bagaimana jadwal les sampai ke kalender Anda.">
        <div className="flex items-start gap-4">
          <span className="bg-navy-light text-navy flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="text-sm leading-relaxed text-neutral-600">
            <p>
              Tidak perlu menghubungkan akun Google. Tim Metroscope mengelola kalender bersama, dan
              setiap sesi punya tombol{' '}
              <strong className="font-medium text-neutral-900">Tambah ke Google Calendar</strong> di
              halaman Jadwal Les yang memasukkan sesi itu ke kalender pribadi Anda dengan satu klik.
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              Metroscope tidak pernah meminta akses ke isi kalender atau email Anda.
            </p>
          </div>
        </div>
      </Card>

      {/* The one session control that can be truthful */}
      <Card
        title="Perangkat & Sesi"
        subtitle="Kalau perangkat Anda hilang atau dipakai orang lain, akhiri semua sesi."
      >
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100">
            <ShieldCheck className="h-5 w-5 text-neutral-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-neutral-600">
              Keluar dari akun ini di semua perangkat, termasuk yang sedang Anda pakai. Setelah itu
              Anda perlu masuk lagi.
            </p>
            <button
              type="button"
              onClick={signOutEverywhere}
              disabled={signingOut}
              className="border-maroon text-maroon hover:bg-maroon mt-4 rounded-full border px-6 py-2.5 text-sm font-medium transition-colors hover:text-white disabled:opacity-60"
            >
              {signingOut ? 'Mengeluarkan…' : 'Keluar dari semua perangkat'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
