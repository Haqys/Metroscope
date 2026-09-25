'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banknote, Upload } from 'lucide-react';

import { formatIdr } from '@/lib/format';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FileDrop, Input, RadioGroup, Select, Textarea } from '@/components/ui/field';

/** Outstanding bills that can still receive a payment. TODO: `GET /invoices?status=unpaid`. */
const OPEN_BILLS = [
  { id: 'b3', label: 'INV-2026-08-002 · Bagas Nugroho · Biaya Lomba', amount: 500_000 },
  { id: 'b4', label: 'INV-2026-06-011 · Bagas Nugroho · Bulanan Juni', amount: 850_000 },
  { id: 'b6', label: 'INV-2026-07-009 · Nabila Putri · Materi', amount: 250_000 },
];

const METHODS = [
  { value: 'CASH' as const, label: 'Tunai', description: 'Dibayar langsung di tempat' },
  {
    value: 'TRANSFER' as const,
    label: 'Transfer Manual',
    description: 'Masuk rekening, dicatat manual',
  },
];

type Method = 'CASH' | 'TRANSFER';

/**
 * **Catat Pembayaran (offline)**: records money already received: cash at the
 * office, or a transfer the team reconciled by hand.
 *
 * Separate from "Buat Tagihan" (`/finance/invoices/new`), which *issues* a bill.
 * This form never creates a bill; it settles one that already exists.
 *
 * TODO: wire submit to `POST /invoices/:id/payments` (writes Payment + audit).
 */
export function OfflinePaymentForm() {
  const router = useRouter();
  const [billId, setBillId] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState<Date | undefined>(new Date());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bill = OPEN_BILLS.find((b) => b.id === billId);
  const paid = Number(amount);
  const remaining = bill && Number.isFinite(paid) ? bill.amount - paid : undefined;
  const isPartial = typeof remaining === 'number' && remaining > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billId) return setError('Pilih tagihan yang dibayar');
    if (!Number.isFinite(paid) || paid < 1000) return setError('Nominal tidak valid');
    if (bill && paid > bill.amount) return setError('Nominal melebihi sisa tagihan');
    if (!paidAt) return setError('Pilih tanggal pembayaran');

    setError(null);
    setSaving(true);
    // TODO: await api.post(`/invoices/${billId}/payments`, { amount: paid, method, paidAt, note })
    await new Promise((r) => setTimeout(r, 500));
    router.push('/finance/invoices');
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4">
        <p className="text-sm text-amber-900">
          <strong className="font-semibold">Form ini untuk pembayaran offline.</strong> Untuk
          menagih siswa, gunakan{' '}
          <Link href="/finance/invoices/new" className="font-semibold underline">
            Buat Tagihan
          </Link>
          .
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Tagihan</h2>

        <div className="mt-5 space-y-5">
          <Field label="Tagihan yang Dibayar" required>
            <Select
              value={billId}
              onChange={(e) => {
                setBillId(e.target.value);
                setError(null);
              }}
            >
              <option value="">Pilih tagihan</option>
              {OPEN_BILLS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}, {formatIdr(b.amount)}
                </option>
              ))}
            </Select>
          </Field>

          {bill && (
            <div className="border-navy/15 bg-navy-light/40 rounded-xl border px-4 py-3">
              <p className="text-navy text-sm">
                Sisa tagihan: <strong className="font-semibold">{formatIdr(bill.amount)}</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">
          Pembayaran Diterima
        </h2>

        <div className="mt-5 space-y-5">
          <Field label="Metode" required>
            <RadioGroup
              options={METHODS}
              value={method}
              onChange={setMethod}
              label="Metode pembayaran"
              columns={2}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Nominal Diterima"
              required
              error={error ?? undefined}
              description={isPartial ? `Cicilan, sisa ${formatIdr(remaining!)}` : undefined}
            >
              <Input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                placeholder={bill ? String(bill.amount) : '850000'}
                invalid={!!error}
              />
            </Field>

            <Field label="Tanggal Pembayaran" required>
              <DatePicker value={paidAt} onChange={setPaidAt} placeholder="Pilih tanggal" />
            </Field>
          </div>

          {method === 'TRANSFER' && (
            <FileDrop
              label="Bukti Transfer"
              hint="opsional untuk pencatatan manual"
              icon={<Upload className="h-5 w-5" />}
            />
          )}

          <Field
            label="Catatan"
            hint="opsional"
            description="Mis. dibayar tunai oleh ayah saat pengambilan rapor."
          >
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          <Banknote className="h-4 w-4" />
          {saving
            ? 'Menyimpan…'
            : isPartial
              ? 'Catat Pembayaran Sebagian'
              : 'Catat Pembayaran Lunas'}
        </button>
        <Link href="/finance/invoices" className="text-sm text-neutral-400 hover:text-neutral-700">
          Batal
        </Link>
      </div>
    </form>
  );
}
