'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ACTION_GROUPS, actionsInGroup } from '@/lib/actions-catalogue';
import type { RoleDetail } from '@/lib/api';
import { PAGE_GROUPS, PAGES, pagesInGroup } from '@/lib/pages';
import { createRole, deleteRole, updateRole } from '@/lib/team-actions';
import { cn } from '@/lib/utils';

const TONES = [
  { value: 'bg-rose-50 text-rose-700 ring-rose-200/70', label: 'Merah muda' },
  { value: 'bg-sky-50 text-sky-700 ring-sky-200/70', label: 'Biru' },
  { value: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70', label: 'Hijau' },
  { value: 'bg-amber-50 text-amber-700 ring-amber-200/70', label: 'Kuning' },
  { value: 'bg-violet-50 text-violet-700 ring-violet-200/70', label: 'Ungu' },
];

/** What the dialog edits: an existing role, or a blank one for "new". */
type Draft = Omit<RoleDetail, 'memberCount'> & { memberCount?: number };

const BLANK: Draft = {
  id: '',
  code: '',
  name: '',
  description: '',
  isSystem: false,
  isCustomer: false,
  pages: ['/home', '/tasks'],
  actions: [],
  home: '/home',
  tone: TONES[0]!.value,
};

/**
 * Create and edit roles, including CUSTOM ones (doc 12 §1, doc 14 Task 0.4).
 *
 * A role is a name plus a set of page hrefs plus a set of action verbs, so the
 * Head can invent "Admin Lomba" and grant it exactly what it needs with no code
 * change. This page has described that mechanism since it was built; it did not
 * implement it, `save()` wrote to `useState` seeded from a local fixture, so a
 * custom role lived exactly as long as the tab stayed open.
 *
 * Action verbs are new here too. The editor granted only pages, which meant a
 * custom role could be given the finance screens and never the ability to act
 * on them: visible, inert, and indistinguishable from a bug to whoever held it.
 */
export function RoleManager({ roles }: { roles: RoleDetail[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const openNew = () => {
    setError(null);
    setEditing({ ...BLANK });
  };

  const togglePage = (href: string) => {
    if (!editing) return;
    const has = editing.pages.includes(href);
    const pages = has ? editing.pages.filter((p) => p !== href) : [...editing.pages, href];
    setEditing({
      ...editing,
      pages,
      // Keep the landing page valid at all times. The API refuses a home that
      // is not granted, and a role that lands on a 403 is worse than the 422.
      home: pages.includes(editing.home) ? editing.home : (pages[0] ?? '/home'),
    });
  };

  const toggleAction = (value: string) => {
    if (!editing) return;
    const has = editing.actions.includes(value);
    setEditing({
      ...editing,
      actions: has ? editing.actions.filter((a) => a !== value) : [...editing.actions, value],
    });
  };

  const save = async () => {
    if (!editing) return;
    if (editing.name.trim().length < 2) return setError('Nama role minimal 2 karakter.');
    if (editing.pages.length === 0) return setError('Pilih minimal satu halaman.');

    setBusy(true);
    setError(null);

    const payload = {
      name: editing.name.trim(),
      home: editing.home,
      tone: editing.tone ?? undefined,
      pages: editing.pages,
      actions: editing.actions,
    };

    const result = editing.id
      ? await updateRole(editing.id, {
          ...payload,
          description: editing.description?.trim() || null,
        })
      : await createRole({
          ...payload,
          description: editing.description?.trim() || undefined,
          // Derived from the name so nobody has to invent an identifier. The
          // API validates the shape and rejects a duplicate.
          code:
            editing.code.trim() ||
            editing.name
              .trim()
              .toUpperCase()
              .replace(/\s+/g, '_')
              .replace(/[^A-Z0-9_]/g, ''),
        });

    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal menyimpan role.');

    setEditing(null);
    router.refresh();
  };

  const remove = async (role: RoleDetail) => {
    setListError(null);
    const result = await deleteRole(role.id);
    // The API refuses to delete a role somebody still holds, and says how many.
    if (!result.ok) return setListError(result.error ?? 'Gagal menghapus role.');
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {roles.filter((r) => r.isSystem).length} role bawaan ·{' '}
          {roles.filter((r) => !r.isSystem).length} role custom
        </p>
        <button
          type="button"
          onClick={openNew}
          className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Role Baru
        </button>
      </div>

      {listError && (
        <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-4 rounded-xl border p-3 text-xs">
          {listError}
        </p>
      )}

      <div className="fx-stagger mt-5 grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="fx-hover rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md px-2.5 py-0.5 text-xs font-bold ring-1',
                      role.tone ?? 'bg-neutral-100 text-neutral-600 ring-neutral-200',
                    )}
                  >
                    {role.name}
                  </span>
                  {role.isSystem ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400">
                      <Lock className="h-3 w-3" />
                      Bawaan
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-700 uppercase">
                      Custom
                    </span>
                  )}
                  {role.isCustomer && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                      Pelanggan
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-neutral-400">{role.code}</p>
                {role.description && (
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                    {role.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setEditing({ ...role });
                  }}
                  className="hover:border-navy/40 hover:text-navy rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors"
                >
                  Atur
                </button>
                {!role.isSystem && (
                  <button
                    type="button"
                    onClick={() => remove(role)}
                    aria-label={`Hapus role ${role.name}`}
                    className="hover:border-maroon/40 hover:text-maroon rounded-lg border border-neutral-200 p-1.5 text-neutral-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
                {role.pages.length} halaman · {role.actions.length} izin · {role.memberCount} akun
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {role.pages.slice(0, 6).map((href) => (
                  <span
                    key={href}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500"
                  >
                    {href}
                  </span>
                ))}
                {role.pages.length > 6 && (
                  <span className="px-1 text-[10px] text-neutral-400">
                    +{role.pages.length - 6} lagi
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editing.isSystem
                    ? `Atur Izin, ${editing.name}`
                    : editing.id
                      ? `Ubah Role, ${editing.name}`
                      : 'Role Baru'}
                </DialogTitle>
              </DialogHeader>

              <div className="max-h-[70vh] space-y-5 overflow-y-auto">
                {!editing.isSystem && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nama Role" required>
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="Admin Lomba"
                      />
                    </Field>
                    <Field label="Warna Chip">
                      <Select
                        value={editing.tone ?? TONES[0]!.value}
                        onChange={(e) => setEditing({ ...editing, tone: e.target.value })}
                      >
                        {TONES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}

                {!editing.isSystem && (
                  <Field label="Deskripsi" hint="opsional">
                    <Textarea
                      rows={2}
                      value={editing.description ?? ''}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      placeholder="Fokus mengurus lomba & jadwal, tanpa akses keuangan."
                    />
                  </Field>
                )}

                {/* Page grants */}
                <Field
                  label="Halaman yang Boleh Diakses"
                  description="Centang halaman yang muncul di menu role ini. Sub-halaman ikut terbuka otomatis."
                >
                  <div className="max-h-64 space-y-4 overflow-y-auto rounded-xl border border-neutral-200 p-4">
                    {PAGE_GROUPS.map((group) => {
                      const items = pagesInGroup(group);
                      if (items.length === 0) return null;
                      return (
                        <div key={group}>
                          <p className="mb-2 text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
                            {group}
                          </p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {items.map((p) => {
                              const on = editing.pages.includes(p.href);
                              const locked = p.locked && editing.code === 'HEAD';
                              return (
                                <button
                                  key={p.href}
                                  type="button"
                                  disabled={locked}
                                  onClick={() => togglePage(p.href)}
                                  className={cn(
                                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                                    on
                                      ? 'border-navy bg-navy-light/50'
                                      : 'hover:border-navy/40 border-neutral-200',
                                    locked && 'cursor-not-allowed opacity-60',
                                  )}
                                >
                                  <Check on={on} />
                                  <span className="min-w-0">
                                    <span
                                      className={cn(
                                        'block text-xs font-medium',
                                        on ? 'text-navy' : 'text-neutral-700',
                                      )}
                                    >
                                      {p.label}
                                    </span>
                                    <span className="block font-mono text-[10px] text-neutral-400">
                                      {p.href}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Field>

                {/* Action grants */}
                <Field
                  label="Izin Tindakan"
                  description="Halaman menentukan apa yang bisa DILIHAT; izin menentukan apa yang bisa DILAKUKAN."
                >
                  <div className="max-h-64 space-y-4 overflow-y-auto rounded-xl border border-neutral-200 p-4">
                    {ACTION_GROUPS.map((group) => (
                      <div key={group}>
                        <p className="mb-2 text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
                          {group}
                        </p>
                        <div className="grid gap-1.5">
                          {actionsInGroup(group).map((a) => {
                            const on = editing.actions.includes(a.value);
                            return (
                              <button
                                key={a.value}
                                type="button"
                                onClick={() => toggleAction(a.value)}
                                className={cn(
                                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                                  on
                                    ? 'border-navy bg-navy-light/50'
                                    : 'hover:border-navy/40 border-neutral-200',
                                )}
                              >
                                <Check on={on} />
                                <span className="min-w-0">
                                  <span
                                    className={cn(
                                      'flex items-center gap-1.5 text-xs font-medium',
                                      on ? 'text-navy' : 'text-neutral-700',
                                    )}
                                  >
                                    {a.label}
                                    {a.dangerous && on && (
                                      <AlertTriangle className="text-maroon h-3 w-3" />
                                    )}
                                  </span>
                                  <span className="block text-[10px] text-neutral-400">
                                    {a.hint}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Field>

                <Field
                  label="Halaman Awal (landing)"
                  description="Dibuka pertama setelah login bagi user yang role utamanya ini."
                >
                  <Select
                    value={editing.home}
                    onChange={(e) => setEditing({ ...editing, home: e.target.value })}
                  >
                    {editing.pages.map((href) => (
                      <option key={href} value={href}>
                        {PAGES.find((p) => p.href === href)?.label ?? href}
                      </option>
                    ))}
                  </Select>
                </Field>

                {error && <p className="text-maroon text-xs">{error}</p>}

                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="bg-navy hover:bg-navy-dark flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {busy ? 'Menyimpan…' : 'Simpan Role'}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
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
  );
}
