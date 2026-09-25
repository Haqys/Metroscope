'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Field, Input, Select } from '@/components/ui/field';
import type { RoleDetail } from '@/lib/api';
import { createUser } from '@/lib/team-actions';
import { cn } from '@/lib/utils';

const schema = z.object({
  fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter'),
  displayName: z.string().optional(),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Create an internal account (doc 12 §3).
 * Roles are picked from the live role list, **including custom roles**, so a
 * role invented in `/settings/roles` is immediately assignable here.
 *
 * TODO: wire submit to `POST /users` + invite email.
 */
export function UserForm({ roles: catalogue }: { roles: RoleDetail[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>([]);
  const [primaryRole, setPrimaryRole] = useState('');
  const [roleError, setRoleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** One key per mounted form: a double-submit must not create two accounts. */
  const [idemKey] = useState(() => crypto.randomUUID());

  // PARENT exists so guardians have an identity, not so somebody can be made a
  // parent from /team. The API refuses it too.
  const assignable = catalogue.filter((r) => !r.isCustomer);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { fullName: '', displayName: '', email: '', phone: '' },
  });

  const toggleRole = (code: string) => {
    setRoleError(null);
    setRoles((rs) => {
      const next = rs.includes(code) ? rs.filter((r) => r !== code) : [...rs, code];
      // Keep primaryRole valid.
      setPrimaryRole((p) => (next.includes(p) ? p : (next[0] ?? '')));
      return next;
    });
  };

  const onSubmit = async (_data: FormValues) => {
    if (roles.length === 0) {
      setRoleError('Pilih minimal satu role');
      return;
    }
    setError(null);
    const result = await createUser(
      {
        fullName: _data.fullName,
        displayName: _data.displayName?.trim() || undefined,
        email: _data.email,
        phone: _data.phone?.trim() || undefined,
        roles,
        primaryRole,
      },
      idemKey,
    );
    if (!result.ok) {
      setError(result.error ?? 'Gagal membuat akun.');
      return;
    }
    router.push('/team');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Identitas</h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Nama Lengkap" error={errors.fullName?.message} required>
            <Input
              placeholder="Sarah Amelia"
              invalid={!!errors.fullName}
              {...register('fullName')}
            />
          </Field>
          <Field
            label="Nama Panggilan"
            hint="opsional"
            description="Dipakai di UI, mis. “Kak Sarah”."
          >
            <Input placeholder="Kak Sarah" {...register('displayName')} />
          </Field>
          <Field
            label="Email"
            error={errors.email?.message}
            required
            description="Dipakai untuk login."
          >
            <Input
              type="email"
              placeholder="sarah@metroscope.id"
              invalid={!!errors.email}
              {...register('email')}
            />
          </Field>
          <Field label="Telepon" hint="opsional">
            <Input placeholder="0812-3456-7890" {...register('phone')} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Role</h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          Boleh lebih dari satu, termasuk role custom yang kamu buat sendiri.
        </p>

        <div className="mt-5">
          <Field label="Pilih Role" error={roleError ?? undefined} required>
            <div className="grid gap-2 sm:grid-cols-2">
              {assignable.map((role) => {
                const on = roles.includes(role.code);
                return (
                  <button
                    key={role.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleRole(role.code)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors',
                      on
                        ? 'border-navy bg-navy-light/50'
                        : 'hover:border-navy/40 border-neutral-200',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2',
                        on ? 'border-navy bg-navy' : 'border-neutral-300',
                      )}
                      aria-hidden
                    >
                      {on && (
                        <svg viewBox="0 0 10 8" className="h-2 w-2 fill-none stroke-white stroke-2">
                          <path d="M1 4l2.5 2.5L9 1" strokeLinecap="round" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            on ? 'text-navy' : 'text-neutral-700',
                          )}
                        >
                          {role.name}
                        </span>
                        {!role.isSystem && (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-rose-700 uppercase">
                            Custom
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        {role.pages.length} halaman
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {roles.length > 0 && (
            <div className="mt-5">
              <Field label="Role Utama" description="Menentukan halaman yang dibuka setelah login.">
                <Select value={primaryRole} onChange={(e) => setPrimaryRole(e.target.value)}>
                  {roles.map((code) => {
                    const r = assignable.find((x) => x.code === code);
                    return (
                      <option key={code} value={code}>
                        {r?.name ?? code} → {r?.home}
                      </option>
                    );
                  })}
                </Select>
              </Field>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="border-maroon/30 bg-maroon-light/40 text-maroon rounded-xl border p-3 text-xs">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-navy shadow-navy/20 hover:bg-navy-dark rounded-full px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
        >
          {isSubmitting ? 'Menyimpan…' : 'Buat User & Kirim Undangan'}
        </button>
        <Link href="/team" className="text-sm text-neutral-400 hover:text-neutral-700">
          Batal
        </Link>
      </div>
    </form>
  );
}
