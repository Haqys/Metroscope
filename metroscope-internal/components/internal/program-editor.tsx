'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, ImagePlus, Loader2 } from 'lucide-react';

import { MediaPicker } from '@/components/internal/media-picker';
import { saveProgramDraft } from '@/lib/article-actions';
import type { MediaAsset, ProgramEditable } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Programme editor (doc 13 §9.4, doc 14 §2.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The screen that ends `lib/programs-data.ts`. Everything a parent reads on
 * `/programs/[slug]`, including the price, is set here and published through
 * the same pipeline articles use. Marketing changes a price without a deploy,
 * which is the whole point of doc 13 §9.
 *
 * Editing is confined to DRAFT. Submit, approve, schedule and publish live on
 * the shared content page, unchanged since 2.1.
 */

const CATEGORIES = [
  { value: 'ACADEMIC', label: 'Akademik' },
  { value: 'NON_ACADEMIC', label: 'Non-Akademik' },
  { value: 'CREATIVE', label: 'Kreatif' },
] as const;

const LEVELS = ['SD', 'SMP', 'SMA'] as const;

const IDR = new Intl.NumberFormat('id-ID');

export function ProgramEditor({ program }: { program: ProgramEditable }) {
  const router = useRouter();
  const editable = program.status === 'DRAFT';

  const [name, setName] = useState(program.name);
  const [summary, setSummary] = useState(program.summary ?? '');
  const [description, setDescription] = useState(program.description ?? '');
  const [body, setBody] = useState(program.body ?? '');
  const [category, setCategory] = useState(program.category);
  const [levels, setLevels] = useState<string[]>(program.levels);
  const [durationMonths, setDurationMonths] = useState(program.durationMonths);
  const [cadence, setCadence] = useState(program.cadence ?? '');
  const [priceMonthly, setPriceMonthly] = useState(program.priceMonthly);
  const [cover, setCover] = useState<{ id: string; url: string | null; alt: string | null } | null>(
    program.coverId ? { id: program.coverId, url: program.coverUrl, alt: program.coverAlt } : null,
  );
  const [picker, setPicker] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * The save reads the form from a ref, not from its own closure.
   *
   * Same reason as the article editor: every handler calls `setX()` then
   * `queueSave()` in one tick, so a save scheduled from that render would send
   * the values from BEFORE the edit and report success. That bug shipped once
   * already in 2.3, an editor's first change to any field was silently
   * discarded, and the shape that caused it is identical here.
   */
  const form = useRef({
    name,
    summary,
    description,
    body,
    category,
    levels,
    durationMonths,
    cadence,
    priceMonthly,
    cover,
  });
  form.current = {
    name,
    summary,
    description,
    body,
    category,
    levels,
    durationMonths,
    cadence,
    priceMonthly,
    cover,
  };

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const save = useCallback(async () => {
    if (!editable) return;
    dirty.current = false;
    setState('saving');
    setError(null);

    const f = form.current;
    const result = await saveProgramDraft(program.id, {
      name: f.name.trim(),
      summary: f.summary.trim() || null,
      description: f.description.trim() || null,
      body: f.body.trim() || null,
      category: f.category,
      levels: f.levels,
      durationMonths: f.durationMonths,
      cadence: f.cadence.trim() || null,
      priceMonthly: f.priceMonthly,
      coverId: f.cover?.id ?? null,
    });

    if (!result.ok) {
      setState('idle');
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    setState('saved');
    router.refresh();
  }, [editable, program.id, router]);

  const queueSave = useCallback(() => {
    if (!editable) return;
    dirty.current = true;
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
  }, [editable, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const toggleLevel = (level: string) => {
    setLevels((prev) => {
      // At least one level, always: a programme for nobody is not a programme,
      // and the API's schema refuses an empty array anyway.
      const next = prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level];
      return next.length ? next : prev;
    });
    queueSave();
  };

  const field =
    'focus:border-navy focus:ring-navy/20 mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        {!editable && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/70">
            Program berstatus <strong>{program.status}</strong>, hanya draf yang bisa diubah.
            Kembalikan ke draf dari panel alur kerja untuk menyunting.
          </p>
        )}

        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            queueSave();
          }}
          disabled={!editable}
          placeholder="Nama program"
          aria-label="Nama program"
          className="w-full border-0 bg-transparent p-0 text-3xl font-bold tracking-tight text-neutral-900 placeholder:text-neutral-300 focus:ring-0 focus:outline-none disabled:text-neutral-500"
        />

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <label htmlFor="summary" className="text-sm font-semibold text-neutral-900">
            Ringkasan
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Satu kalimat di kartu program dan hasil pencarian.
          </p>
          <textarea
            id="summary"
            value={summary}
            disabled={!editable}
            rows={2}
            maxLength={400}
            onChange={(e) => {
              setSummary(e.target.value);
              queueSave();
            }}
            className={field}
          />

          <label
            htmlFor="description"
            className="mt-5 block text-sm font-semibold text-neutral-900"
          >
            Deskripsi
          </label>
          <p className="mt-1 text-xs text-neutral-500">Paragraf pembuka di halaman program.</p>
          <textarea
            id="description"
            value={description}
            disabled={!editable}
            rows={5}
            maxLength={4000}
            onChange={(e) => {
              setDescription(e.target.value);
              queueSave();
            }}
            className={field}
          />

          <label htmlFor="body" className="mt-5 block text-sm font-semibold text-neutral-900">
            Isi lengkap
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Penjelasan panjang: kurikulum, metode, siapa yang cocok. Satu paragraf per baris.
          </p>
          <textarea
            id="body"
            value={body}
            disabled={!editable}
            rows={10}
            maxLength={20000}
            onChange={(e) => {
              setBody(e.target.value);
              queueSave();
            }}
            className={field}
          />
        </section>

        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>
            {program.version > 0 ? `versi ${program.version}` : 'belum pernah terbit'} · /
            {program.slug}
          </span>
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
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200/70">
            {error}
          </p>
        )}
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Gambar sampul</h3>
          {cover ? (
            <div className="mt-3">
              <div className="overflow-hidden rounded-xl bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.url ?? ''}
                  alt={cover.alt ?? ''}
                  className="h-32 w-full object-cover"
                />
              </div>
              {!cover.alt && (
                <p className="mt-2 text-xs text-amber-700">Belum ada teks alternatif.</p>
              )}
              {editable && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPicker(true)}
                    className="text-navy text-xs font-semibold hover:underline"
                  >
                    Ganti
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCover(null);
                      queueSave();
                    }}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={!editable}
              onClick={() => setPicker(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-6 text-sm text-neutral-500 hover:border-neutral-400 disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              Pilih dari Media
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Penawaran</h3>

          <label htmlFor="price" className="mt-3 block text-xs font-medium text-neutral-600">
            Biaya per bulan (Rp)
          </label>
          {/*
            An integer field, not a formatted one. Money is integers everywhere
            in this system, and a text input with thousand separators is how a
            price arrives at the API as "1.500.000" and is stored as 1.
          */}
          <input
            id="price"
            type="number"
            min={0}
            step={50000}
            value={priceMonthly}
            disabled={!editable}
            onChange={(e) => {
              setPriceMonthly(Number(e.target.value) || 0);
              queueSave();
            }}
            className={field}
          />
          <p className="mt-1 text-xs text-neutral-400">Rp {IDR.format(priceMonthly)} / bulan</p>

          <label htmlFor="category" className="mt-4 block text-xs font-medium text-neutral-600">
            Kategori
          </label>
          <select
            id="category"
            value={category}
            disabled={!editable}
            onChange={(e) => {
              setCategory(e.target.value as ProgramEditable['category']);
              queueSave();
            }}
            className={field}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-neutral-600">Jenjang</legend>
            <div className="mt-2 flex gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  disabled={!editable}
                  aria-pressed={levels.includes(l)}
                  onClick={() => toggleLevel(l)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    levels.includes(l)
                      ? 'bg-navy text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="duration" className="mt-4 block text-xs font-medium text-neutral-600">
            Durasi (bulan per batch)
          </label>
          <input
            id="duration"
            type="number"
            min={1}
            max={60}
            value={durationMonths}
            disabled={!editable}
            onChange={(e) => {
              setDurationMonths(Number(e.target.value) || 1);
              queueSave();
            }}
            className={field}
          />

          <label htmlFor="cadence" className="mt-4 block text-xs font-medium text-neutral-600">
            Jadwal
          </label>
          <input
            id="cadence"
            value={cadence}
            disabled={!editable}
            placeholder="2x seminggu, 90 menit"
            onChange={(e) => {
              setCadence(e.target.value);
              queueSave();
            }}
            className={field}
          />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
          <h3 className="font-semibold text-neutral-900">Alur kerja</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Ajukan review, jadwalkan, dan terbitkan dari halaman konten, sama seperti artikel.
          </p>
          <a
            href={`/site/program/${program.id}`}
            className="text-navy mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <Eye className="h-4 w-4" />
            Buka alur &amp; riwayat versi
          </a>
        </section>
      </aside>

      <MediaPicker
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(asset: MediaAsset) => {
          setCover({ id: asset.id, url: asset.url, alt: asset.alt });
          if (!asset.isReady)
            setError('Gambar ini belum punya teks alternatif, lengkapi di Media.');
          setPicker(false);
          queueSave();
        }}
        kind="image"
        requireReady={false}
        folder="program"
      />
    </div>
  );
}
