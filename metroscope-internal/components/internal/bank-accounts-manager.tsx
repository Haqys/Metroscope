'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, Check, Pencil, Plus, X } from 'lucide-react';

import { Field, Input } from '@/components/ui/field';
import type { BankAccount } from '@/lib/api';
import {
  createBankAccount,
  deactivateBankAccount,
  updateBankAccount,
  type BankAccountInput,
} from '@/lib/org-actions';

const EMPTY: BankAccountInput = {
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  note: '',
  isActive: true,
  orderIndex: 0,
};

/**
 * The accounts a parent transfers to (FR-PAY-2).
 *
 * This is the highest-leverage settings screen in the product: change a number
 * here and every future transfer goes somewhere else. Which is why the API
 * audits each change with before/after, and why removing an account deactivates
 * rather than deletes. It still appears on invoices already sent.
 */
export function BankAccountsManager({ accounts }: { accounts: BankAccount[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BankAccountInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (a: BankAccount) => {
    setCreating(false);
    setEditing(a.id);
    setError(null);
    setForm({
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      accountHolder: a.accountHolder,
      note: a.note ?? '',
      isActive: a.isActive,
      orderIndex: a.orderIndex,
    });
  };

  const cancel = () => {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    const result = editing ? await updateBankAccount(editing, form) : await createBankAccount(form);
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    cancel();
    router.refresh();
  };

  const deactivate = async (id: string) => {
    setSaving(true);
    const result = await deactivateBankAccount(id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Gagal menonaktifkan.');
      return;
    }
    router.refresh();
  };

  const active = accounts.filter((a) => a.isActive);

  return (
    <div className="space-y-6">
      {/*
        The one thing that makes this screen consequential, said plainly.
        Somebody editing an account number should know what they are changing.
      */}
      {active.length === 0 && (
        <div className="border-maroon/30 bg-maroon-light/40 rounded-2xl border p-4">
          <p className="text-maroon text-sm font-semibold">Belum ada rekening aktif</p>
          <p className="mt-1 text-xs text-neutral-600">
            Orang tua tidak bisa membayar sampai minimal satu rekening aktif, halaman pembayaran
            akan kosong.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {accounts.map((a) =>
          editing === a.id ? (
            <AccountForm
              key={a.id}
              form={form}
              setForm={setForm}
              onSubmit={submit}
              onCancel={cancel}
              saving={saving}
              error={error}
            />
          ) : (
            <div
              key={a.id}
              className={`flex items-start justify-between gap-4 rounded-2xl border p-5 ${
                a.isActive
                  ? 'border-neutral-200/70 bg-white'
                  : 'border-dashed border-neutral-300 bg-neutral-50/60'
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">
                    {a.bankName}
                    {!a.isActive && (
                      <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                        Nonaktif
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-sm text-neutral-800">{a.accountNumber}</p>
                  <p className="text-xs text-neutral-500">a.n. {a.accountHolder}</p>
                  {a.note && <p className="mt-1 text-xs text-neutral-400">{a.note}</p>}
                </div>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  className="hover:border-navy/40 hover:text-navy flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Ubah
                </button>
                {a.isActive && (
                  <button
                    type="button"
                    onClick={() => deactivate(a.id)}
                    disabled={saving}
                    className="hover:border-maroon/40 hover:text-maroon flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" />
                    Nonaktifkan
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {creating ? (
        <AccountForm
          form={form}
          setForm={setForm}
          onSubmit={submit}
          onCancel={cancel}
          saving={saving}
          error={error}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
            setForm({ ...EMPTY, orderIndex: accounts.length });
          }}
          className="hover:border-navy/40 hover:text-navy flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 py-4 text-sm font-semibold text-neutral-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Tambah Rekening
        </button>
      )}

      {error && !creating && !editing && <p className="text-maroon text-xs">{error}</p>}
    </div>
  );
}

function AccountForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  saving,
  error,
}: {
  form: BankAccountInput;
  setForm: (f: BankAccountInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="border-navy/20 space-y-4 rounded-2xl border bg-white p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Bank" required>
          <Input
            value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            placeholder="BCA"
          />
        </Field>
        <Field label="Nomor Rekening" required>
          <Input
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            placeholder="1234567890"
            className="font-mono"
          />
        </Field>
        <Field label="Atas Nama" required>
          <Input
            value={form.accountHolder}
            onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
            placeholder="Metroscope Indonesia"
          />
        </Field>
        <Field label="Catatan" hint="Opsional, mis. cabang.">
          <Input
            value={form.note ?? ''}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="KCP Denpasar"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          className="accent-navy h-4 w-4"
        />
        Tampilkan di halaman pembayaran orang tua
      </label>

      {error && <p className="text-maroon text-xs">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy hover:bg-navy-dark flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
