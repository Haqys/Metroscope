'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/field';
import type { RoleDetail, StaffMember } from '@/lib/api';
import { setUserRoles, setUserStatus } from '@/lib/team-actions';
import { roleLabel, roleTone } from '@/lib/user-display';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  INACTIVE: 'bg-neutral-200 text-neutral-500',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
};

interface Draft {
  id: string;
  fullName: string;
  roles: string[];
  primaryRole: string;
  status: string;
}

/**
 * Staff accounts and their role grants (doc 14 Task 0.4).
 *
 * `roles` comes from `GET /v1/roles`, not from a local table, which is what
 * makes a role the Head invented five minutes ago assignable here. Customer
 * roles are filtered out: PARENT exists so guardians have an identity, not so
 * somebody can be made a parent from the team page.
 *
 * Saving goes to the API. It used to call `setUsers()` in React state, the
 * dialog closed, the row updated, and nothing had happened.
 */
export function UserTable({ rows, roles }: { rows: StaffMember[]; roles: RoleDetail[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignable = roles.filter((r) => !r.isCustomer);

  const open = (u: StaffMember) => {
    setError(null);
    setEditing({
      id: u.id,
      fullName: u.fullName,
      roles: [...u.roles],
      primaryRole: u.primaryRole ?? u.roles[0] ?? '',
      status: u.status,
    });
  };

  const toggleRole = (code: string) => {
    if (!editing) return;
    const has = editing.roles.includes(code);
    // The API refuses an account with zero roles; don't offer it either.
    if (has && editing.roles.length === 1) return;
    const next = has ? editing.roles.filter((r) => r !== code) : [...editing.roles, code];
    setEditing({
      ...editing,
      roles: next,
      primaryRole: next.includes(editing.primaryRole) ? editing.primaryRole : next[0]!,
    });
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);

    const result = await setUserRoles(editing.id, editing.roles, editing.primaryRole);
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }

    const current = rows.find((r) => r.id === editing.id);
    if (current && current.status !== editing.status) {
      const status = await setUserStatus(editing.id, editing.status as 'ACTIVE' | 'INACTIVE');
      if (!status.ok) {
        setBusy(false);
        // The roles DID save. Reporting a flat failure would have somebody redo
        // a change that already took effect.
        setError(`Role tersimpan, tapi status gagal diubah: ${status.error}`);
        router.refresh();
        return;
      }
    }

    setBusy(false);
    setEditing(null);
    router.refresh();
  };

  const columns: ColumnDef<StaffMember>[] = [
    {
      accessorKey: 'fullName',
      header: 'Nama',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span className="bg-navy-light text-navy flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
            {row.original.fullName
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-neutral-900">{row.original.fullName}</p>
            {row.original.displayName && (
              <p className="truncate text-xs text-neutral-400">
                &ldquo;{row.original.displayName}&rdquo;
              </p>
            )}
          </div>
        </div>
      ),
    },
    { accessorKey: 'email', header: 'Email' },
    {
      id: 'roles',
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((r) => (
            <span
              key={r}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1',
                roleTone(r, roles),
                r === row.original.primaryRole && 'ring-2',
              )}
              title={r === row.original.primaryRole ? 'Role utama' : undefined}
            >
              {roleLabel(r, roles)}
            </span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap',
            STATUS_BADGE[row.original.status] ?? STATUS_BADGE.INACTIVE,
          )}
        >
          {STATUS_LABEL[row.original.status] ?? row.original.status}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        minWidth={820}
        onRowClick={open}
        emptyMessage="Belum ada akun internal."
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Ubah Role, {editing.fullName}</DialogTitle>
              </DialogHeader>

              <Field
                label="Role"
                description="Satu orang boleh punya lebih dari satu role (mis. Ketua sekaligus Mentor)."
              >
                <div className="flex flex-wrap gap-2">
                  {assignable.map((r) => {
                    const on = editing.roles.includes(r.code);
                    return (
                      <button
                        key={r.code}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleRole(r.code)}
                        className={cn(
                          'rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
                          on
                            ? 'bg-navy shadow-navy/20 text-white shadow-sm'
                            : 'hover:ring-navy/40 bg-white text-neutral-600 ring-1 ring-neutral-300',
                        )}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Role Utama" description="Menentukan halaman yang dibuka setelah login.">
                <Select
                  value={editing.primaryRole}
                  onChange={(e) => setEditing({ ...editing, primaryRole: e.target.value })}
                >
                  {editing.roles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r, roles)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Status Akun"
                description="Menonaktifkan akun langsung memutus aksesnya."
              >
                <Select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Nonaktif</option>
                </Select>
              </Field>

              {error && <p className="text-maroon mt-3 text-xs">{error}</p>}

              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="bg-navy hover:bg-navy-dark mt-4 w-full rounded-full py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
              >
                {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
