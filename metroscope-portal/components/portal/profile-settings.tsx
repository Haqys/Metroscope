'use client';

import { useRef, useState } from 'react';
import { Camera, Check, Lock } from 'lucide-react';

import { ADMIN_EMAIL } from '@/lib/constants';
import {
  updatePreferences,
  updateProfile,
  updateStudentSettings,
  uploadAvatar,
} from '@/lib/me-actions';
import type { MyProfile } from '@/lib/api';

/**
 * Pengaturan Profil (FR-SET-1..3), connected to the account that is signed in.
 *
 * Until now every card here was decoration. The student block was a `STUDENT`
 * const naming "Aditya Pratama" with a made-up NIS; the guardian block was
 * pre-filled with "Rani Wulandari"; the phone field, the channel toggles and
 * the leaderboard switch all had `TODO: PATCH /students/:id` above handlers
 * that did nothing but flash "Tersimpan" and forget. A parent could set the
 * privacy of their child's name, see the confirmation, reload, and find it
 * back where it started.
 *
 * Three destinations now, each with its own authority:
 *
 *   · the account (`PATCH /me/profile`), gated by `users_update_self`;
 *   · the channels (`PUT /me/preferences`), gated by
 *     `notification_preferences_all`;
 *   · the child (`PATCH /me/students/:id`), gated by
 *     `app.update_student_self()`, which is where the privacy toggle and the
 *     guardian's contact details actually live.
 *
 * Read-only fields stay read-only, and the padlock is honest: a family cannot
 * write `dob`, `school`, `level` or `account_status`, and there is no endpoint
 * that would let them.
 */

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20';

const PHONE_RE = /^[0-9+()\s-]{8,20}$/;

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

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-navy' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function SaveButton({
  saved,
  saving,
  onClick,
}: {
  saved: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="bg-navy hover:bg-navy-dark rounded-full px-7 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {saving ? 'Menyimpan…' : 'Simpan'}
      </button>
      {saved && (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
          <Check className="h-3.5 w-3.5" /> Tersimpan
        </span>
      )}
    </div>
  );
}

const dateId = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function ProfileSettings({ profile }: { profile: MyProfile }) {
  /** One child today; a family with siblings gets the first and a note. */
  const child = profile.students[0] ?? null;

  // Avatar
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.photoUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Account
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  /**
   * Channels, read from `notification_preferences`. Absent means ON: the table
   * records exceptions, and a family who has never opened this page should get
   * their invoice reminders.
   */
  const enabledFor = (channel: 'EMAIL' | 'IN_APP') =>
    profile.preferences.find((p) => p.channel === channel && p.category === 'all')?.enabled ?? true;

  const [channels, setChannels] = useState({
    EMAIL: enabledFor('EMAIL'),
    IN_APP: enabledFor('IN_APP'),
  });
  const [channelsSaved, setChannelsSaved] = useState(false);
  const [channelsSaving, setChannelsSaving] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  // Guardian contact, on the STUDENT row
  const [guardian, setGuardian] = useState({
    name: child?.parentName ?? '',
    phone: child?.parentPhone ?? '',
  });
  const [guardianSaved, setGuardianSaved] = useState(false);
  const [guardianSaving, setGuardianSaving] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);

  // Privacy (FR-SET-1)
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(child?.showOnLeaderboard ?? false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2500);
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setUploading(true);

    const res = await uploadAvatar(file);
    setUploading(false);
    // Let the same file be picked again after a failure.
    if (fileRef.current) fileRef.current.value = '';

    if (!res.ok || !res.data) {
      setAvatarError(res.error ?? 'Gagal mengunggah foto.');
      return;
    }
    setAvatarUrl(res.data.photoUrl);
  };

  const saveAccount = async () => {
    if (fullName.trim().length < 2) {
      setAccountError('Nama minimal 2 karakter.');
      return;
    }
    if (phone && !PHONE_RE.test(phone)) {
      setAccountError('Nomor telepon: gunakan angka, boleh dengan + ( ) atau tanda hubung.');
      return;
    }
    setAccountError(null);
    setAccountSaving(true);
    const res = await updateProfile({ fullName: fullName.trim(), phone: phone.trim() || null });
    setAccountSaving(false);
    if (!res.ok) {
      setAccountError(res.error ?? 'Gagal menyimpan.');
      return;
    }
    flash(setAccountSaved);
  };

  const saveChannels = async () => {
    setChannelsError(null);
    setChannelsSaving(true);
    const res = await updatePreferences([
      { channel: 'EMAIL', category: 'all', enabled: channels.EMAIL },
      { channel: 'IN_APP', category: 'all', enabled: channels.IN_APP },
    ]);
    setChannelsSaving(false);
    if (!res.ok) {
      setChannelsError(res.error ?? 'Gagal menyimpan.');
      return;
    }
    flash(setChannelsSaved);
  };

  const saveGuardian = async () => {
    if (!child) return;
    if (guardian.phone && !PHONE_RE.test(guardian.phone)) {
      setGuardianError('Nomor telepon: gunakan angka, boleh dengan + ( ) atau tanda hubung.');
      return;
    }
    setGuardianError(null);
    setGuardianSaving(true);
    const res = await updateStudentSettings(child.id, {
      parentName: guardian.name.trim() || null,
      parentPhone: guardian.phone.trim() || null,
    });
    setGuardianSaving(false);
    if (!res.ok) {
      setGuardianError(res.error ?? 'Gagal menyimpan.');
      return;
    }
    flash(setGuardianSaved);
  };

  /** Saved on the switch itself: a toggle with a Save button below it invites
      the reading that the toggle already did something. */
  const savePrivacy = async (next: boolean) => {
    if (!child) return;
    const previous = showOnLeaderboard;
    setShowOnLeaderboard(next);
    setPrivacyError(null);
    setPrivacySaving(true);
    const res = await updateStudentSettings(child.id, { showOnLeaderboard: next });
    setPrivacySaving(false);
    if (!res.ok) {
      setShowOnLeaderboard(previous);
      setPrivacyError(res.error ?? 'Gagal menyimpan.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <Card title="Foto Profil" subtitle="Tampil di portal dan papan peringkat.">
        <div className="flex items-center gap-6">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, not a configured next/image domain
            <img
              src={avatarUrl}
              alt="Foto profil"
              className="ring-maroon/20 h-20 w-20 rounded-full object-cover ring-2"
            />
          ) : (
            <span className="bg-navy flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold text-white">
              {initials(profile.fullName)}
            </span>
          )}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onAvatarChange}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="hover:border-navy hover:text-navy flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 transition-colors disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {uploading ? 'Mengunggah…' : 'Ganti Foto'}
            </button>
            <p className="mt-2 text-xs text-neutral-400">JPG/PNG/WebP · maksimal 5 MB</p>
            {avatarError && <p className="text-maroon mt-1 text-xs">{avatarError}</p>}
          </div>
        </div>
      </Card>

      {/* The account itself */}
      <Card title="Akun" subtitle="Nama dan nomor telepon yang dipakai untuk menghubungi Anda.">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">Nama Lengkap</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">Nomor Telepon</span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xx xxxx xxxx"
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">Email</span>
            <input
              type="email"
              value={profile.email ?? ''}
              disabled
              className={`${inputClass} cursor-not-allowed bg-neutral-50 text-neutral-500`}
            />
            <span className="mt-1.5 block text-xs text-neutral-400">
              Email adalah identitas masuk dan hanya bisa diubah oleh tim Metroscope.
            </span>
          </label>
        </div>
        {accountError && <p className="text-maroon mt-3 text-xs">{accountError}</p>}
        <SaveButton saved={accountSaved} saving={accountSaving} onClick={saveAccount} />
      </Card>

      {/* Read-only student data */}
      {child ? (
        <Card
          title="Data Siswa"
          subtitle="Data ini dikelola tim Metroscope dan tidak bisa diubah sendiri."
        >
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {[
              { label: 'Nama Lengkap', value: child.name },
              { label: 'Nomor Siswa', value: child.slug },
              { label: 'Tanggal Lahir', value: dateId(child.dob) },
              { label: 'Asal Sekolah', value: child.school ?? '—' },
              { label: 'Jenjang', value: child.level ?? '—' },
              { label: 'Program', value: child.programNames ?? 'Belum terdaftar' },
              { label: 'Bergabung Sejak', value: dateId(child.joinDate) },
              {
                label: 'Status Akun',
                value: child.accountStatus === 'ACTIVE' ? 'Aktif' : 'Terbatas',
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[11px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-neutral-900">
                  {item.value}
                  <Lock className="h-3 w-3 shrink-0 text-neutral-300" aria-hidden />
                </dd>
              </div>
            ))}
          </dl>
          {profile.students.length > 1 && (
            <p className="mt-6 text-xs text-neutral-500">
              Akun ini terhubung dengan {profile.students.length} siswa. Pengaturan di bawah berlaku
              untuk {child.name}.
            </p>
          )}
          <p className="mt-6 text-xs text-neutral-400">
            Ada data yang keliru?{' '}
            <a
              href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(`Koreksi data siswa. ${child.name}`)}`}
              className="text-navy font-medium hover:underline"
            >
              Hubungi admin untuk koreksi
            </a>
            .
          </p>
        </Card>
      ) : null}

      {/* Channels */}
      <Card
        title="Notifikasi"
        subtitle="Reminder les, tagihan, dan hasil assessment. Pilih ke mana kabar dikirim."
      >
        <div className="space-y-4">
          {(
            [
              {
                key: 'EMAIL' as const,
                label: 'Email',
                desc: `Dikirim ke ${profile.email ?? 'email akun Anda'}`,
              },
              {
                key: 'IN_APP' as const,
                label: 'Notifikasi portal',
                desc: 'Lonceng notifikasi di dalam portal',
              },
            ] as const
          ).map((ch) => (
            <div key={ch.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{ch.label}</p>
                <p className="truncate text-xs text-neutral-400">{ch.desc}</p>
              </div>
              <Toggle
                checked={channels[ch.key]}
                onChange={(v) => setChannels((c) => ({ ...c, [ch.key]: v }))}
                label={`Notifikasi ${ch.label}`}
              />
            </div>
          ))}
        </div>
        {channelsError && <p className="text-maroon mt-3 text-xs">{channelsError}</p>}
        <SaveButton saved={channelsSaved} saving={channelsSaving} onClick={saveChannels} />
      </Card>

      {/* Guardian contact, stored on the student record */}
      {child ? (
        <Card
          title="Data Wali / Orang Tua"
          subtitle="Kontak yang tim hubungi soal jadwal dan tagihan. Kami tidak meminta NIK/KTP."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                Nama Lengkap
              </span>
              <input
                type="text"
                value={guardian.name}
                onChange={(e) => setGuardian((g) => ({ ...g, name: e.target.value }))}
                placeholder="Nama wali/orang tua"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                Nomor Telepon
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={guardian.phone}
                onChange={(e) => setGuardian((g) => ({ ...g, phone: e.target.value }))}
                placeholder="08xx xxxx xxxx"
                className={inputClass}
              />
            </label>
          </div>
          {guardianError && <p className="text-maroon mt-3 text-xs">{guardianError}</p>}
          <SaveButton saved={guardianSaved} saving={guardianSaving} onClick={saveGuardian} />
        </Card>
      ) : null}

      {/* Privacy */}
      {child ? (
        <Card title="Privasi" subtitle="Kendalikan bagaimana nama anak tampil ke pengguna lain.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-900">
                Tampilkan nama di papan peringkat
              </p>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-neutral-400">
                Jika nonaktif, keluarga lain hanya melihat &ldquo;Siswa lain&rdquo; di posisi anak
                Anda. Peringkat dan poinnya tetap dihitung. Default nonaktif untuk melindungi
                privasi anak.
              </p>
              {privacyError && <p className="text-maroon mt-1.5 text-xs">{privacyError}</p>}
            </div>
            <Toggle
              checked={showOnLeaderboard}
              onChange={(v) => void savePrivacy(v)}
              disabled={privacySaving}
              label="Tampilkan nama di papan peringkat"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
