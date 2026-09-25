'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus, Loader2, Search } from 'lucide-react';

import { MediaPicker } from '@/components/internal/media-picker';
import { saveContentSeo } from '@/lib/surface-actions';
import type { ContentSeo, MediaAsset } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Per-page SEO overrides, with a SERP preview (doc 13 §9.4, §10.7).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `seo_meta` has been read by every public page since §2.4, title, description,
 * canonical, OG image, `noindex` and a JSON-LD override, and until now nothing
 * could WRITE it except SQL. The `PUT` endpoint existed and had no caller. So a
 * `noindex` flag that §2.8's sitemap now honours was a flag no editor could
 * set, and half of what §2.4–§2.7 built was reachable only by a developer.
 *
 * One panel for all six content types, because an override is the same five
 * fields whatever it overrides.
 *
 * **Everything here is optional and everything has a fallback.** The public
 * pages derive a title from the content's own title and a description from its
 * excerpt or summary, so a piece nobody opened this panel for still ships
 * correct metadata. That is the point of the placeholders below: an empty field
 * is not a missing description, it is a derived one.
 */

const TITLE_IDEAL = 60;
const DESC_IDEAL = 155;

export function SeoPanel({
  type,
  id,
  seo,
  contentTitle,
  siteUrl,
}: {
  type: string;
  id: string;
  seo: ContentSeo;
  /** The row's own title, what the public page falls back to. */
  contentTitle: string;
  /** Origin for the preview. Empty when the site URL is not configured. */
  siteUrl: string;
}) {
  const router = useRouter();

  const [values, setValues] = useState({
    title: seo.title ?? '',
    description: seo.description ?? '',
    canonical: seo.canonical ?? '',
    ogImageKey: seo.ogImageKey ?? '',
    noindex: seo.noindex,
  });
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(seo.ogImageUrl);
  const [picker, setPicker] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * The save reads from a ref written during render, not from its own closure,
   * the same pattern as every other editor here, for the reason §2.3 found the
   * hard way: a handler that calls `setValues` and then schedules a save sends
   * the values from BEFORE the edit, and reports success.
   */
  const latest = useRef(values);
  latest.current = values;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    setState('saving');
    setError(null);

    const v = latest.current;
    const result = await saveContentSeo(type, id, {
      /** Blank means "derive it", which is null in the database, not "". */
      title: v.title.trim() || null,
      description: v.description.trim() || null,
      canonical: v.canonical.trim() || null,
      ogImageKey: v.ogImageKey || null,
      noindex: v.noindex,
    });

    if (!result.ok) {
      setState('idle');
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    setState('saved');
    router.refresh();
  }, [id, router, type]);

  const queueSave = useCallback(() => {
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
  }, [save]);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    queueSave();
  };

  const input =
    'focus:border-navy focus:ring-navy/20 mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm';

  /** What the public page will actually print, given the fallbacks it applies. */
  const previewTitle = values.title.trim() || contentTitle;
  const previewUrl = seo.publicPath ? `${siteUrl}${seo.publicPath}` : null;

  const counter = (value: string, ideal: number) => (
    <span className={value.length > ideal ? 'text-maroon font-semibold' : 'text-neutral-400'}>
      {value.length}/{ideal}
    </span>
  );

  return (
    <section className="rounded-2xl border border-neutral-200/70 bg-white p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
        <Search className="h-4 w-4 text-neutral-400" aria-hidden />
        SEO
      </h2>

      {/*
        The SERP preview doc 13 §10.7 asks for.

        It shows the title fallback truthfully, every public page uses the
        content's own title when the override is blank, and deliberately does
        NOT guess the description fallback: that one differs per type (an
        article falls back to its excerpt, a programme to its summary), and a
        preview that invents the wrong one teaches an editor to distrust it.
      */}
      <div className="mt-4 rounded-xl bg-neutral-50 p-4">
        <p className="truncate text-xs text-neutral-500">
          {previewUrl ?? 'Tidak punya URL publik sendiri'}
        </p>
        <p className="mt-1 truncate text-base text-[#1a0dab]">{previewTitle}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600">
          {values.description.trim() || 'Diturunkan dari ringkasan konten.'}
        </p>
        {values.noindex && (
          <p className="text-maroon mt-2 text-xs font-semibold">
            noindex aktif, halaman ini tidak akan muncul di hasil pencarian, dan tidak dicantumkan
            di sitemap.xml.
          </p>
        )}
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="seo-title" className="flex justify-between text-sm font-medium">
            <span className="text-neutral-700">Judul SEO</span>
            {counter(values.title, TITLE_IDEAL)}
          </label>
          <p className="mt-0.5 text-xs text-neutral-500">
            Kosongkan untuk memakai judul kontennya sendiri.
          </p>
          <input
            id="seo-title"
            value={values.title}
            maxLength={70}
            placeholder={contentTitle}
            onChange={(e) => set('title', e.target.value)}
            className={input}
          />
        </div>

        <div>
          <label htmlFor="seo-description" className="flex justify-between text-sm font-medium">
            <span className="text-neutral-700">Deskripsi SEO</span>
            {counter(values.description, DESC_IDEAL)}
          </label>
          <p className="mt-0.5 text-xs text-neutral-500">
            {/* Soft warning, never a blocker, doc 13 §10.7. */}
            Lebih dari {DESC_IDEAL} karakter biasanya dipotong Google.
          </p>
          <textarea
            id="seo-description"
            rows={3}
            value={values.description}
            maxLength={200}
            onChange={(e) => set('description', e.target.value)}
            className={input}
          />
        </div>

        <div>
          <label htmlFor="seo-canonical" className="text-sm font-medium text-neutral-700">
            Canonical URL
          </label>
          <p className="mt-0.5 text-xs text-neutral-500">
            Hanya isi kalau konten ini juga tayang di alamat lain, dan alamat itu yang harus
            diperingkat.
          </p>
          <input
            id="seo-canonical"
            type="url"
            value={values.canonical}
            placeholder={previewUrl ?? ''}
            onChange={(e) => set('canonical', e.target.value)}
            className={input}
          />
        </div>

        <div>
          <p className="text-sm font-medium text-neutral-700">Gambar bagikan (OG)</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Dipakai saat tautan dibagikan di WhatsApp. Kosong = memakai sampul kontennya.
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            {ogImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ogImageUrl} alt="" className="h-14 w-24 rounded-lg object-cover" />
            )}
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            >
              <ImagePlus className="h-4 w-4" />
              {values.ogImageKey ? 'Ganti' : 'Pilih'}
            </button>
            {values.ogImageKey && (
              <button
                type="button"
                onClick={() => {
                  setOgImageUrl(null);
                  set('ogImageKey', '');
                }}
                className="text-maroon text-xs font-semibold hover:underline"
              >
                Hapus
              </button>
            )}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={values.noindex}
            onChange={(e) => set('noindex', e.target.checked)}
            className="text-navy mt-0.5 h-4 w-4 rounded border-neutral-300"
          />
          <span>
            Sembunyikan dari mesin pencari (noindex)
            <span className="mt-0.5 block text-xs text-neutral-500">
              Halaman tetap bisa dibuka lewat tautan, tapi keluar dari hasil pencarian dan dari
              sitemap.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
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
        <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-3 rounded-xl border p-3 text-xs">
          {error}
        </p>
      )}

      <MediaPicker
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(asset: MediaAsset) => {
          setOgImageUrl(asset.url);
          set('ogImageKey', asset.storageKey);
          setPicker(false);
        }}
        kind="image"
        requireReady={false}
        folder="og"
      />
    </section>
  );
}
