'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AlertTriangle, FileText, Trash2, Upload } from 'lucide-react';

import type { MediaAsset } from '@/lib/api';
import { uploadMedia } from '@/lib/media-actions';
import { MediaDetail } from '@/components/internal/media-detail';
import { cn } from '@/lib/utils';

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/**
 * The media library: grid, upload, and a detail panel.
 *
 * Deliberately knows nothing about what the assets are for. It is the same
 * component whether an image ends up on an article, a page or a programme,
 * which is the point of building media before any of them exist.
 */
export function MediaBrowser({ items, showingBin }: { items: MediaAsset[]; showingBin: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploading(files.length);

    // Sequential, not parallel: five concurrent 10 MB uploads on a phone
    // connection is how all five time out instead of four succeeding.
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const result = await uploadMedia(file);
      if (!result.ok) failures.push(`${file.name}: ${result.error}`);
      setUploading((n) => n - 1);
    }

    setUploading(0);
    if (failures.length) setError(failures.join(' · '));
    router.refresh();
  };

  return (
    <div>
      {!showingBin && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files);
          }}
          className={cn(
            'rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
            dragging ? 'border-navy bg-navy-light/40' : 'border-neutral-300 bg-white',
          )}
        >
          <Upload className="mx-auto h-6 w-6 text-neutral-400" aria-hidden />
          <p className="mt-2 text-sm text-neutral-600">
            Tarik berkas ke sini, atau{' '}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="text-navy font-semibold underline"
            >
              pilih dari komputer
            </button>
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            JPG, PNG, WebP, AVIF, GIF atau PDF · maksimal 10 MB. SVG tidak didukung.
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => void upload(e.target.files)}
          />
          {uploading > 0 && (
            <p className="text-navy mt-3 text-xs font-semibold">
              Mengunggah… {uploading} berkas tersisa
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-4 rounded-xl border p-3 text-xs">
          {error}
        </p>
      )}

      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              onClick={() => setSelected(asset)}
              className="hover:border-navy/40 group w-full overflow-hidden rounded-xl border border-neutral-200/70 bg-white text-left transition-colors"
            >
              <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-neutral-50">
                {asset.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={asset.alt ?? ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: `${asset.focalX * 100}% ${asset.focalY * 100}%` }}
                  />
                ) : (
                  <FileText className="h-8 w-8 text-neutral-300" aria-hidden />
                )}
              </span>
              <span className="block p-3">
                <span className="block truncate text-xs font-medium text-neutral-900">
                  {asset.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
                  <span>{formatSize(asset.sizeBytes)}</span>
                  {asset.width && (
                    <span>
                      {asset.width}×{asset.height}
                    </span>
                  )}
                  {asset.usageCount > 0 && <span>· dipakai {asset.usageCount}×</span>}
                </span>
                {/* The accessibility gate, visible where the decision is made. */}
                {!asset.isReady && !asset.deletedAt && (
                  <span className="text-maroon mt-1.5 flex items-center gap-1 text-[10px] font-semibold">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Belum ada alt text
                  </span>
                )}
                {asset.deletedAt && (
                  <span className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-neutral-400">
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Di tempat sampah
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && <MediaDetail asset={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
