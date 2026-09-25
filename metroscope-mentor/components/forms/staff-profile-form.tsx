'use client';

import { useRef, useState } from 'react';
import type { SessionUser } from '@/lib/types';
import type { OwnProfile } from '@/lib/api';
import { CheckCircle2, ImagePlus } from 'lucide-react';

import { Field, Input, Textarea } from '@/components/ui/field';
import { updateOwnProfile, uploadOwnAvatar } from '@/lib/profile-actions';
import { initialsOf, ROLE_LABEL } from '@/lib/user-display';
import { cn } from '@/lib/utils';

/**
 * Edit own staff profile (doc 11 §11), connected to the account signing in.
 *
 * It used to have `TODO: wire to PATCH /users/me` above a submit handler whose
 * whole body was a 500 ms sleep and `setSaved(true)`. Every field typed here
 * was discarded on navigation, and the "Ganti Foto" button had no handler at
 * all, it was a styled div. A mentor updating the display name that parents
 * see ("Kak Dinda") watched it save and then reappear as their legal name.
 *
 * The endpoints are `/v1/me/*`, the same ones the customer portal uses: every
 * account owns its own row whatever role it holds, and `users_update_self` is
 * the gate. There is deliberately no staff-specific profile endpoint, one
 * would be the same UPDATE behind a second authorisation path.
 *
 * Roles stay read-only here and that is not cosmetic: `UpdateProfile` on the
 * API side does not accept `status`, `primaryRole` or role grants, so an
 * account cannot promote itself even if this form were rewritten to try.
 */
export function StaffProfileForm({ user, profile }: { user: SessionUser; profile: OwnProfile }) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const isMentor = user.roles.includes('MENTOR');

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setUploading(true);

    const res = await uploadOwnAvatar(file);
    setUploading(false);
    // Let the same file be chosen again after a failure.
    if (fileRef.current) fileRef.current.value = '';

    if (!res.ok || !res.data) {
      setPhotoError(res.error ?? 'Gagal mengunggah foto.');
      return;
    }
    setPhotoUrl(res.data.photoUrl);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) {
      setError('Nama minimal 2 karakter.');
      return;
    }
    /**
     * doc 11 §11 makes the display name the one parents see. A mentor without
     * one shows up to families under their legal name, so it is required for
     * that role and optional for everybody else.
     */
    if (isMentor && displayName.trim().length === 0) {
      setError('Nama panggilan wajib untuk mentor, ini yang dilihat siswa dan orang tua.');
      return;
    }
    if (phone && !/^[0-9+()\s-]{8,20}$/.test(phone)) {
      setError('Nomor telepon: gunakan angka, boleh dengan + ( ) atau tanda hubung.');
      return;
    }

    setSaving(true);
    const res = await updateOwnProfile({
      fullName: fullName.trim(),
      displayName: displayName.trim() || null,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
    });
    setSaving(false);

    if (!res.ok) {
      setError(res.error ?? 'Gagal menyimpan profil.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
    >
      {/* Avatar */}
      <div className="flex items-center gap-5">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, not a configured next/image domain
          <img
            src={photoUrl}
            alt="Foto profil"
            className="ring-navy/15 h-20 w-20 shrink-0 rounded-full object-cover ring-2"
          />
        ) : (
          <span className="from-navy to-navy-dark shadow-navy/20 flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xl font-bold text-white shadow-md">
            {initialsOf({ fullName, displayName })}
          </span>
        )}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickPhoto}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="hover:border-navy/40 hover:text-navy flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 transition-colors disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4" />
            {uploading ? 'Mengunggah…' : 'Ganti Foto'}
          </button>
          <p className="mt-1.5 text-xs text-neutral-400">JPG/PNG/WebP · maks 5 MB</p>
          {photoError && <p className="text-maroon mt-1 text-xs">{photoError}</p>}
        </div>
      </div>

      {/* Roles (read-only, only the Head can change these) */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {user.roles.map((r) => (
          <span
            key={r}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              r === user.primaryRole ? 'bg-navy text-white' : 'bg-neutral-100 text-neutral-600',
            )}
          >
            {ROLE_LABEL[r]}
            {r === user.primaryRole && ' · utama'}
          </span>
        ))}
        <span className="text-xs text-neutral-400">Role hanya bisa diubah oleh Ketua</span>
      </div>

      <div className="mt-6 space-y-5 border-t border-neutral-100 pt-6">
        <Field label="Nama Lengkap" required description="Dipakai untuk kontrak dan log audit.">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <Field
          label="Nama Panggilan"
          hint={isMentor ? 'wajib untuk mentor' : 'opsional'}
          description='Nama yang dilihat siswa, mis. "Kak Dinda".'
        >
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Kak Dinda"
          />
        </Field>

        <Field label="Nomor Telepon" description="Dipakai tim untuk urusan jadwal mendadak.">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xx xxxx xxxx"
          />
        </Field>

        {isMentor && (
          <Field
            label="Bio Publik"
            description="Ditampilkan ke orang tua di halaman profil mentor."
          >
            <Textarea
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Alumni Olimpiade Sains Nasional, mengajar sejak 2022…"
            />
          </Field>
        )}

        <Field label="Email" description="Identitas masuk. Hanya Ketua yang bisa mengubahnya.">
          <Input value={profile.email ?? ''} disabled />
        </Field>

        {error && <p className="text-maroon text-sm">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
          >
            {saving ? 'Menyimpan…' : 'Simpan Profil'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Tersimpan
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
