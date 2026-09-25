'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, ImageOff, Search } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MediaAsset } from '@/lib/api';
import { uploadMedia } from '@/lib/media-actions';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reusable media picker.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Built in Task 2.2, deliberately not wired to anything yet.** There is no
 * content editor to place an image into until Articles (§2.3) and Pages (§2.6),
 * and wiring it into a hero field that does not exist would mean guessing at
 * that field's shape and rebuilding this when the guess is wrong.
 *
 * The contract is the whole point: it takes a callback and returns an asset. It
 * knows nothing about articles, pages or programmes, so all three consume it
 * unchanged.
 *
 *   <MediaPicker
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSelect={(asset) => setCoverId(asset.id)}
 *     kind="image"
 *   />
 *
 * `requireReady` defaults to true and is the accessibility gate in component
 * form: an image without alt text cannot be *placed*, only uploaded and
 * described (doc 13 §9.7). Turning it off is for pickers choosing a document,
 * where alt text does not apply.
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  kind,
  requireReady = true,
  folder,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  kind?: 'image' | 'pdf';
  requireReady?: boolean;
  folder?: string;
}) {
  const [items, setItems] = useState<MediaAsset[] | null>(null);
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const params = new URLSearchParams({ limit: '60' });
    if (q.trim()) params.set('q', q.trim());
    if (kind) params.set('kind', kind);
    if (folder) params.set('folder', folder);

    // Debounced so typing does not fire a request per keystroke.
    const timer = setTimeout(() => {
      fetch(`/api/bff/site/media?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => {
          if (!cancelled) setItems(b?.data?.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, kind, folder]);

  const uploadAndPick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadMedia(file, { folder });
    setUploading(false);

    if (!result.ok || !result.data) return setError(result.error ?? 'Unggahan gagal.');

    /**
     * A freshly uploaded image has no alt text, so it fails the gate. Rather
     * than silently refusing the thing the user just chose, select it and let
     * the consumer surface the warning, the alternative is an upload button
     * that appears to do nothing.
     */
    onSelect(result.data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pilih Media</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari media…"
            className="focus:border-navy focus:ring-navy/20 w-full rounded-full border border-neutral-300 py-2.5 pr-4 pl-9 text-sm"
          />
        </div>

        <div className="mt-4 max-h-[50vh] overflow-y-auto">
          {items === null ? (
            <p className="py-10 text-center text-sm text-neutral-400">Memuat…</p>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <ImageOff className="mx-auto h-6 w-6 text-neutral-300" aria-hidden />
              <p className="mt-2 text-sm text-neutral-500">Tidak ada media yang cocok.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((asset) => {
                const blocked = requireReady && !asset.isReady;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => {
                        onSelect(asset);
                        onClose();
                      }}
                      title={blocked ? 'Butuh alt text sebelum bisa dipasang' : asset.title}
                      className={cn(
                        'w-full overflow-hidden rounded-xl border text-left transition-colors',
                        blocked
                          ? 'cursor-not-allowed border-neutral-200 opacity-50'
                          : 'hover:border-navy border-neutral-200',
                      )}
                    >
                      <span className="flex aspect-square items-center justify-center bg-neutral-50">
                        {asset.mimeType.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={asset.url}
                            alt={asset.alt ?? ''}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FileText className="h-6 w-6 text-neutral-300" aria-hidden />
                        )}
                      </span>
                      <span className="block truncate p-2 text-[11px] text-neutral-700">
                        {asset.title}
                      </span>
                      {blocked && (
                        <span className="text-maroon flex items-center gap-1 px-2 pb-2 text-[10px] font-semibold">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Perlu alt text
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-neutral-100 pt-4">
          <label className="text-navy cursor-pointer text-sm font-semibold underline">
            {uploading ? 'Mengunggah…' : 'Unggah baru'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void uploadAndPick(e.target.files?.[0])}
            />
          </label>
          {error && <p className="text-maroon text-xs">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
