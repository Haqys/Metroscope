'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Eye, FileWarning, X } from 'lucide-react';

import { Field, Input, Textarea } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import type { Invoice } from '@/lib/api';
import { proofUrl, rejectPayment, verifyPayment } from '@/lib/billing-actions';

const formatIdr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const timeAgo = (iso: string | null) => {
  if (!iso) return '-';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
};

/**
 * The verification queue (FR-PAY-3).
 *
 * Approving is the moment money is recognised, so the panel makes the amount
 * explicit rather than assuming it. The default is the full outstanding
 * balance, but a different figure can be entered when the parent transferred
 * less, which is what turns the invoice into an instalment instead of silently
 * overstating what was received.
 */
export function PaymentVerification({ rows }: { rows: Invoice[] }) {
  const router = useRouter();
  const [active, setActive] = useState<Invoice | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  /**
   * One key per opened invoice, not per click. Regenerating it on each attempt
   * would make the required header meaningless, see lib/billing-actions.ts.
   */
  const [idemKey, setIdemKey] = useState('');

  const open = (invoice: Invoice, m: 'approve' | 'reject') => {
    setActive(invoice);
    setMode(m);
    setAmount(String(Math.max(invoice.amount - invoice.paidAmount, 0)));
    setNote('');
    setReason('');
    setError(null);
    setIdemKey(crypto.randomUUID());
  };

  const close = () => {
    setActive(null);
    setError(null);
    setViewing(null);
  };

  const showProof = async (invoice: Invoice) => {
    const url = await proofUrl(invoice.id);
    if (!url) {
      setError('Bukti transfer tidak bisa dibuka.');
      return;
    }
    setViewing(url);
  };

  const submit = async () => {
    if (!active) return;
    setError(null);

    if (mode === 'reject') {
      if (reason.trim().length < 5) {
        setError('Tulis alasan penolakan, orang tua akan menerimanya lewat email.');
        return;
      }
      setBusy(true);
      const result = await rejectPayment(active.id, reason.trim());
      setBusy(false);
      if (!result.ok) return setError(result.error ?? 'Gagal menolak.');
    } else {
      const parsed = Number(amount.replace(/[^\d]/g, ''));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Masukkan nominal yang diterima.');
        return;
      }
      setBusy(true);
      const result = await verifyPayment(active.id, idemKey, {
        grossAmount: parsed,
        note: note.trim() || undefined,
      });
      setBusy(false);
      if (!result.ok) return setError(result.error ?? 'Gagal memverifikasi.');
    }

    close();
    router.refresh();
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Tidak ada bukti transfer yang menunggu"
        description="Bukti yang diunggah orang tua akan muncul di sini untuk diperiksa."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {rows.map((invoice) => {
          const remaining = Math.max(invoice.amount - invoice.paidAmount, 0);
          return (
            <div
              key={invoice.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-neutral-200/70 bg-white p-5"
            >
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{invoice.studentName}</p>
                <p className="mt-0.5 font-mono text-xs text-neutral-400">{invoice.number}</p>
                <p className="mt-2 text-lg font-bold text-neutral-900">{formatIdr(remaining)}</p>
                <p className="text-xs text-neutral-500">
                  {invoice.period} · diunggah {timeAgo(invoice.proofUploadedAt)}
                  {invoice.paidAmount > 0 && ` · sudah dibayar ${formatIdr(invoice.paidAmount)}`}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => showProof(invoice)}
                  className="hover:border-navy/40 hover:text-navy flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Lihat Bukti
                </button>
                <button
                  type="button"
                  onClick={() => open(invoice, 'reject')}
                  className="hover:border-maroon/40 hover:text-maroon flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Tolak
                </button>
                <button
                  type="button"
                  onClick={() => open(invoice, 'approve')}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Setujui
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && !active && <p className="text-maroon mt-3 text-xs">{error}</p>}

      {/* Proof viewer, the URL expires in five minutes by design. */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bukti Transfer</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewing}
                alt="Bukti transfer"
                className="max-h-[60vh] w-full rounded-xl object-contain"
              />
              <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                <FileWarning className="h-3.5 w-3.5" />
                Tautan ini kedaluwarsa dalam 5 menit.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!active} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'approve' ? 'Setujui Pembayaran' : 'Tolak Bukti Transfer'},{' '}
              {active?.studentName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {mode === 'approve' ? (
              <>
                <Field
                  label="Nominal yang diterima"
                  required
                  hint="Isi apa adanya. Kalau kurang dari tagihan, sisanya jadi cicilan."
                >
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="numeric"
                    className="font-mono"
                  />
                </Field>
                <Field label="Catatan" hint="Opsional, mis. nomor referensi transfer.">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <p className="rounded-xl bg-emerald-50/60 p-3 text-xs text-neutral-600">
                  Kalau nominal ini melunasi tagihan, akun siswa langsung aktif dan kuitansi dikirim
                  otomatis ke orang tua.
                </p>
              </>
            ) : (
              <Field
                label="Alasan penolakan"
                required
                hint="Dikirim ke orang tua lewat email, jadi tulis yang jelas."
              >
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mis. nominal transfer tidak sesuai tagihan."
                />
              </Field>
            )}

            {error && <p className="text-maroon text-xs">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={`w-full rounded-full py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                mode === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-maroon hover:bg-maroon-dark'
              }`}
            >
              {busy ? 'Menyimpan…' : mode === 'approve' ? 'Setujui Pembayaran' : 'Tolak Bukti'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
