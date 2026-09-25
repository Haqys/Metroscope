'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';

const MAX_BYTES = 2 * 1024 * 1024; // FR-PAY-2
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Upload a transfer screenshot (FR-PAY-2).
 *
 * Three steps, and the middle one does not touch this service: ask the API for
 * a signed URL, PUT the file straight into the private bucket, then tell the API
 * it landed. The file never passes through a serverless function, 2 MB of image
 * through an invocation buys nothing, and the bucket is private either way.
 *
 * The client-side size and type checks are courtesy, not enforcement: the bucket
 * itself caps at 2 MB and restricts MIME types, and the API refuses a
 * confirmation for an object that is not actually there.
 */
export function ProofUpload({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) {
      setError('Ukuran file maksimal 2 MB. Coba kompres dulu atau screenshot ulang.');
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setError('Format harus JPG, PNG, WEBP, atau PDF.');
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file) {
      setError('Pilih file bukti transfer dulu.');
      return;
    }
    setBusy(true);
    setError(null);

    try {
      // 1. Somewhere to put it. The key is chosen by the server.
      const urlRes = await fetch(`/api/bff/invoices/${invoiceId}/proof-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const urlBody = await urlRes.json().catch(() => null);
      if (!urlRes.ok) {
        throw new Error(urlBody?.error?.message ?? 'Tidak bisa menyiapkan unggahan.');
      }
      const { uploadUrl, proofKey } = urlBody.data;

      // 2. Straight to storage.
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Gagal mengunggah file. Coba lagi.');

      // 3. Tell the API. This is what moves the invoice into Finance's queue.
      const confirm = await fetch(`/api/bff/invoices/${invoiceId}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofKey }),
      });
      const confirmBody = await confirm.json().catch(() => null);
      if (!confirm.ok) {
        throw new Error(confirmBody?.error?.message ?? 'Bukti gagal disimpan.');
      }

      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Bukti transfer terkirim</p>
          <p className="mt-1 text-xs text-neutral-600">
            Tim Keuangan akan memeriksanya, biasanya dalam 1x24 jam pada hari kerja. Kami kabari
            lewat email begitu selesai. Tidak perlu mengirim ulang.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-6">
      <h2 className="text-base font-semibold tracking-tight text-neutral-900">
        Unggah Bukti Transfer
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Screenshot atau PDF dari mutasi bank Anda. Maksimal 2 MB.
      </p>

      <label className="hover:border-navy/40 mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center transition-colors">
        <Upload className="h-5 w-5 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-700">
          {file ? file.name : 'Pilih file bukti transfer'}
        </span>
        <span className="text-xs text-neutral-400">JPG, PNG, WEBP, atau PDF</span>
        <input
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </label>

      {error && <p className="text-maroon mt-3 text-xs">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !file}
        className="bg-maroon hover:bg-maroon-dark mt-5 w-full rounded-full py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
      >
        {busy ? 'Mengirim…' : 'Kirim Bukti Transfer'}
      </button>
    </div>
  );
}
