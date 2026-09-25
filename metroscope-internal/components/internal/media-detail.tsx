'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import type { MediaAsset, MediaUsageRow } from '@/lib/api';
import {
  deleteMedia,
  purgeMedia,
  replaceMedia,
  restoreMedia,
  updateMedia,
} from '@/lib/media-actions';

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/**
 * One asset: preview, metadata, usage, and the destructive actions.
 *
 * Usage is fetched rather than passed, because it is the evidence behind the
 * delete guard and has to be current at the moment somebody presses delete,
 * a count rendered thirty seconds ago is exactly the number you should not
 * decide on.
 */
export function MediaDetail({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const router = useRouter();
  const replaceInput = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(asset.alt ?? '');
  const [caption, setCaption] = useState(asset.caption ?? '');
  const [title, setTitle] = useState(asset.title);
  const [usage, setUsage] = useState<MediaUsageRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bff/site/media/${asset.id}/usage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancelled) setUsage(b?.data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setUsage([]);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, close = false) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal.');
    router.refresh();
    if (close) onClose();
  };

  const save = () =>
    run(() =>
      updateMedia(asset.id, {
        alt: alt.trim() || null,
        caption: caption.trim() || null,
        title: title.trim(),
      }),
    );

  const replace = async (file: File | undefined) => {
    if (!file) return;
    await run(() => replaceMedia(asset.id, file), true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{asset.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {asset.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.url} alt={asset.alt ?? ''} className="w-full object-contain" />
              ) : (
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-navy block p-10 text-center text-sm underline"
                >
                  Buka berkas
                </a>
              )}
            </div>
            <dl className="mt-3 space-y-0.5 text-[11px] text-neutral-500">
              <div>
                {asset.mimeType} · {formatSize(asset.sizeBytes)}
                {asset.width && ` · ${asset.width}×${asset.height}px`}
              </div>
              {asset.uploadedByName && <div>Diunggah {asset.uploadedByName}</div>}
              <div className="font-mono break-all text-neutral-400">{asset.storageKey}</div>
            </dl>
          </div>

          <div className="space-y-4">
            <Field label="Judul">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            <Field
              label="Alt text"
              description="Wajib untuk gambar sebelum bisa dipasang, dibaca pembaca layar dan mesin pencari."
              error={
                !alt.trim() && asset.mimeType.startsWith('image/')
                  ? 'Belum diisi, gambar ini belum bisa dipasang di konten.'
                  : undefined
              }
            >
              <Textarea
                rows={2}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Mis. Siswa Metroscope menerima medali olimpiade sains"
              />
            </Field>

            <Field label="Keterangan" hint="opsional">
              <Textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </Field>

            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="bg-navy hover:bg-navy-dark w-full rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Menyimpan…' : 'Simpan'}
            </button>

            {/* Usage, the evidence behind the delete guard. */}
            <div className="rounded-xl bg-neutral-50 p-3 text-xs">
              {usage === null ? (
                <p className="text-neutral-400">Memeriksa pemakaian…</p>
              ) : usage.length === 0 ? (
                <p className="text-neutral-500">Belum dipakai di konten mana pun.</p>
              ) : (
                <>
                  <p className="font-semibold text-neutral-700">
                    Dipakai di {usage.length} tempat:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-neutral-500">
                    {usage.map((u, i) => (
                      <li key={i}>
                        {u.entityType}
                        {u.field ? ` · ${u.field}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {!asset.deletedAt && (
                <>
                  <button
                    type="button"
                    onClick={() => replaceInput.current?.click()}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Ganti berkas
                  </button>
                  <input
                    ref={replaceInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf"
                    className="hidden"
                    onChange={(e) => void replace(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      confirmDelete
                        ? run(() => deleteMedia(asset.id, true), true)
                        : setConfirmDelete(true)
                    }
                    disabled={busy}
                    className="border-maroon/30 text-maroon hover:bg-maroon-light/40 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmDelete ? 'Yakin? Hapus' : 'Hapus'}
                  </button>
                </>
              )}

              {asset.deletedAt && (
                <>
                  <button
                    type="button"
                    onClick={() => run(() => restoreMedia(asset.id), true)}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Pulihkan
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => purgeMedia(asset.id), true)}
                    disabled={busy || (usage?.length ?? 0) > 0}
                    className="border-maroon/30 text-maroon hover:bg-maroon-light/40 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Musnahkan permanen
                  </button>
                </>
              )}
            </div>

            {confirmDelete && !asset.deletedAt && (usage?.length ?? 0) > 0 && (
              <p className="border-maroon/30 bg-maroon-light/40 text-maroon flex items-start gap-2 rounded-xl border p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Masih dipakai di {usage?.length} tempat. Menghapusnya akan membuat konten itu
                kehilangan gambar.
              </p>
            )}

            {error && <p className="text-maroon text-xs">{error}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
