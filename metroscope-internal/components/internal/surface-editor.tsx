'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, ImagePlus, Loader2 } from 'lucide-react';

import { MediaPicker } from '@/components/internal/media-picker';
import { saveSurfaceDraft } from '@/lib/surface-actions';
import type { MediaAsset } from '@/lib/api';
import { FIELDS } from '@/lib/surface-fields';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  One editor for FAQ entries, testimonials and mentor profiles (§2.7).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three bespoke editors would be three copies of the same autosave, the same
 * stale-closure trap, the same DRAFT-only banner and the same MediaPicker
 * wiring, and the fourth collection would make it four. A field spec per type
 * is the smaller thing: adding a collection is a table, a registry entry, and
 * an entry in `FIELDS` below.
 *
 * Three consumers on the day it was written, which is the bar for extracting
 * it at all.
 */

type Row = Record<string, unknown> & { id: string; status: string; version: number };

export function SurfaceEditor({ type, row }: { type: string; row: Row }) {
  const router = useRouter();
  const editable = row.status === 'DRAFT';
  const fields = FIELDS[type] ?? [];

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, row[f.key] ?? (f.type === 'tags' ? [] : '')])),
  );
  const [picker, setPicker] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>((row.photoUrl as string) ?? null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * The save reads from a ref, not from its own closure.
   *
   * Written during render, for the reason §2.3 found the hard way: a handler
   * that calls `setValues` then schedules a save would send the values from
   * BEFORE the edit and report success. The bug is invisible, the UI says
   * "Tersimpan", which is why every editor in this codebase does it this way.
   */
  const latest = useRef(values);
  latest.current = values;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    if (!editable) return;
    setState('saving');
    setError(null);

    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const value = latest.current[field.key];
      if (field.type === 'number') patch[field.key] = Number(value) || 0;
      else if (field.type === 'checkbox') patch[field.key] = Boolean(value);
      else if (field.type === 'tags') patch[field.key] = value;
      else if (field.type === 'media') patch[field.key] = (value as string) || null;
      else if (field.type === 'date') patch[field.key] = value ? String(value) : null;
      else patch[field.key] = String(value ?? '').trim() || null;
    }
    /** Required fields must never be sent as null, the schema rejects it. */
    for (const key of [
      'question',
      'answer',
      'quote',
      'authorName',
      'displayName',
      'slug',
      /** §3.4: a competition's name and deadline are non-nullable columns. */
      'name',
      'registrationDeadline',
    ]) {
      if (patch[key] === null) delete patch[key];
    }

    const result = await saveSurfaceDraft(type, row.id, patch);
    if (!result.ok) {
      setState('idle');
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    setState('saved');
    router.refresh();
  }, [editable, fields, row.id, router, type]);

  const queueSave = useCallback(() => {
    if (!editable) return;
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
  }, [editable, save]);

  const set = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    queueSave();
  };

  const input =
    'focus:border-navy focus:ring-navy/20 mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50';

  return (
    <div className="mx-auto max-w-3xl">
      {!editable && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/70">
          Berstatus <strong>{row.status}</strong>, hanya draf yang bisa diubah.
        </p>
      )}

      <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6">
        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="text-sm font-medium text-neutral-700">
              {field.label}
            </label>
            {field.hint && <p className="mt-0.5 text-xs text-neutral-500">{field.hint}</p>}

            {field.type === 'media' ? (
              <div className="mt-1.5 flex items-center gap-3">
                {photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                )}
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => setPicker(field.key)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  <ImagePlus className="h-4 w-4" />
                  {values[field.key] ? 'Ganti' : 'Pilih'}
                </button>
                {Boolean(values[field.key]) && editable && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoUrl(null);
                      set(field.key, '');
                    }}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Hapus
                  </button>
                )}
              </div>
            ) : field.type === 'checkbox' ? (
              <label className="mt-1.5 flex items-center gap-2 text-sm text-neutral-700">
                <input
                  id={field.key}
                  type="checkbox"
                  checked={Boolean(values[field.key])}
                  disabled={!editable}
                  onChange={(e) => set(field.key, e.target.checked)}
                  className="text-navy h-4 w-4 rounded border-neutral-300"
                />
                Ya
              </label>
            ) : field.type === 'area' ? (
              <textarea
                id={field.key}
                rows={6}
                value={String(values[field.key] ?? '')}
                disabled={!editable}
                onChange={(e) => set(field.key, e.target.value)}
                className={input}
              />
            ) : field.type === 'tags' ? (
              <input
                id={field.key}
                value={(values[field.key] as string[] | undefined)?.join(', ') ?? ''}
                disabled={!editable}
                onChange={(e) =>
                  set(
                    field.key,
                    e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  )
                }
                className={input}
              />
            ) : (
              <input
                id={field.key}
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={
                  field.type === 'date'
                    ? String(values[field.key] ?? '').slice(0, 10)
                    : String(values[field.key] ?? '')
                }
                disabled={!editable}
                onChange={(e) => set(field.key, e.target.value)}
                className={input}
              />
            )}
          </div>
        ))}
      </section>

      <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
        <span>{row.version > 0 ? `versi ${row.version}` : 'belum pernah terbit'}</span>
        <span aria-live="polite" className="ml-auto flex items-center gap-1.5">
          {state === 'saving' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan…
            </>
          )}
          {state === 'saved' && (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Tersimpan
            </>
          )}
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200/70">
          {error}
        </p>
      )}

      <a
        href={`/site/${type}/${row.id}`}
        className="text-navy mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <Eye className="h-4 w-4" />
        Alur &amp; riwayat versi
      </a>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={(asset: MediaAsset) => {
          if (picker) {
            setPhotoUrl(asset.url);
            set(picker, asset.id);
          }
          setPicker(null);
        }}
        kind="image"
        requireReady={false}
        folder={type}
      />
    </div>
  );
}
