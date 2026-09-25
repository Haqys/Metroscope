'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Eye, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';

import { MediaPicker } from '@/components/internal/media-picker';
import { addBlock, deleteBlock, mintPreview, reorderBlocks, updateBlock } from '@/lib/page-actions';
import type { MediaAsset, PageEditable, PageBlock } from '@/lib/api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Block editor (doc 13 §9.3, doc 14 §2.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * doc 13 §9.3 describes "left = block list (drag to reorder, toggle
 * visibility), right = props form + live preview in an iframe".
 *
 * Reordering is **buttons, not drag**. A drag surface needs a pointer, and the
 * people reviewing marketing copy do it on a phone as often as a laptop,
 * §9.5 says as much when it asks for a shareable preview link. Up/down arrows
 * work with touch, keyboard and a screen reader, and they send the same whole
 * ordered list the drag version would. The preview is a real link rather than
 * an embedded iframe for the same reason: it opens on the device you are
 * holding.
 */

const FIELD =
  'focus:border-navy focus:ring-navy/20 mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50';

/** Which props each block type edits, and how. Mirrors the API's registry. */
const BLOCK_FIELDS: Record<
  string,
  { key: string; label: string; type: 'text' | 'area' | 'media' | 'number'; hint?: string }[]
> = {
  hero: [
    { key: 'eyebrow', label: 'Label kecil', type: 'text' },
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'subheading', label: 'Sub-judul', type: 'area' },
    { key: 'ctaLabel', label: 'Teks tombol', type: 'text' },
    { key: 'ctaHref', label: 'Tautan tombol', type: 'text', hint: 'Diawali / atau https://' },
    { key: 'mediaId', label: 'Gambar', type: 'media' },
  ],
  rich_text: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'text', label: 'Isi', type: 'area', hint: 'Satu baris kosong memisahkan paragraf.' },
  ],
  cta_banner: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'text', label: 'Penjelasan', type: 'area' },
    { key: 'ctaLabel', label: 'Teks tombol', type: 'text' },
    { key: 'ctaHref', label: 'Tautan tombol', type: 'text' },
  ],
  media: [
    { key: 'mediaId', label: 'Gambar', type: 'media' },
    { key: 'caption', label: 'Keterangan', type: 'text' },
  ],
  program_grid: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'limit', label: 'Jumlah kartu', type: 'number' },
  ],
  article_grid: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'category', label: 'Kategori (slug)', type: 'text' },
    { key: 'limit', label: 'Jumlah kartu', type: 'number' },
  ],
  /**
   * The §2.7 collections and §3.4's calendar.
   *
   * `blocks.registry.ts` promised each new type would cost "one schema here,
   * one component in the renderer, one entry in the editor's field map". The
   * first two were paid; this map was not, so four block types existed in the
   * API and the renderer while being unreachable from the page editor. You
   * could not add one, and one added by any other means edited to a blank
   * panel. Fixed here alongside `competition_calendar`, which would otherwise
   * have shipped with the same defect.
   */
  faq_accordion: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'category', label: 'Kategori', type: 'text', hint: 'Kosong = semua kategori.' },
    { key: 'limit', label: 'Jumlah pertanyaan', type: 'number' },
  ],
  testimonial_slider: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'limit', label: 'Jumlah kutipan', type: 'number' },
  ],
  mentor_grid: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'limit', label: 'Jumlah mentor', type: 'number' },
  ],
  contact_form: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'text', label: 'Penjelasan', type: 'area' },
  ],
  competition_calendar: [
    { key: 'heading', label: 'Judul', type: 'text' },
    { key: 'text', label: 'Penjelasan', type: 'area' },
    {
      key: 'schoolLevel',
      label: 'Jenjang',
      type: 'text',
      hint: 'SD, SMP, atau SMA. Kosong = semua.',
    },
    { key: 'limit', label: 'Jumlah kartu', type: 'number' },
    { key: 'ctaLabel', label: 'Teks tautan', type: 'text' },
  ],
};

/**
 * Types whose props are a LIST are edited as JSON for now.
 *
 * `stat_row`, `proof_bar` and `steps` each hold an array of small objects, and
 * a repeater UI is a component in its own right. A textarea validated by the
 * API's Zod schema is honest about that: it is obviously temporary, it cannot
 * save something the renderer would choke on, and it does not pretend to be the
 * finished editor. Naming it here rather than hiding it in a default branch.
 */
const JSON_TYPES = new Set(['stat_row', 'proof_bar', 'steps']);

const TYPE_LABEL: Record<string, string> = {
  hero: 'Hero',
  rich_text: 'Teks',
  cta_banner: 'Ajakan (CTA)',
  stat_row: 'Angka',
  proof_bar: 'Bukti',
  steps: 'Langkah',
  media: 'Gambar',
  program_grid: 'Daftar Program',
  article_grid: 'Daftar Artikel',
  faq_accordion: 'FAQ',
  testimonial_slider: 'Testimoni',
  mentor_grid: 'Mentor',
  contact_form: 'Formulir Kontak',
  competition_calendar: 'Kalender Lomba',
};

export function PageEditor({ page, siteUrl }: { page: PageEditable; siteUrl: string }) {
  const router = useRouter();
  const editable = page.status === 'DRAFT';

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(page.blocks[0]?.id ?? null);
  const [picker, setPicker] = useState<{ blockId: string; key: string } | null>(null);
  const [adding, setAdding] = useState('hero');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.ok) return setError(result.error ?? 'Gagal.');
    router.refresh();
  };

  const block = page.blocks.find((b) => b.id === selected) ?? null;

  const saveProps = (b: PageBlock, patch: Record<string, unknown>) =>
    run(b.id, () => updateBlock(page.id, b.id, { props: { ...b.props, ...patch } }));

  const move = (b: PageBlock, delta: number) => {
    const ids = page.blocks.map((x) => x.id);
    const from = ids.indexOf(b.id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    void run(`move-${b.id}`, () => reorderBlocks(page.id, ids));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      {/* ── left: the block list ── */}
      <aside className="space-y-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">Blok</h3>
            <span className="text-xs text-neutral-400">{page.blocks.length}</span>
          </div>

          <ul className="mt-3 space-y-1.5">
            {page.blocks.map((b, i) => (
              <li key={b.id}>
                <div
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 ${
                    selected === b.id ? 'border-navy bg-navy/5' : 'border-neutral-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(b.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-neutral-800">
                      {TYPE_LABEL[b.type] ?? b.type}
                    </span>
                    {!b.visible && (
                      <span className="text-[11px] text-amber-700">disembunyikan</span>
                    )}
                  </button>

                  {editable && (
                    <>
                      <button
                        type="button"
                        aria-label={`Naikkan blok ${i + 1}`}
                        disabled={i === 0 || busy !== null}
                        onClick={() => move(b, -1)}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Turunkan blok ${i + 1}`}
                        disabled={i === page.blocks.length - 1 || busy !== null}
                        onClick={() => move(b, 1)}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus blok ${i + 1}`}
                        disabled={busy !== null}
                        onClick={() => void run(b.id, () => deleteBlock(page.id, b.id))}
                        className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
            {page.blocks.length === 0 && (
              <li className="py-6 text-center text-sm text-neutral-400">Belum ada blok.</li>
            )}
          </ul>

          {editable && (
            <div className="mt-4 flex gap-2">
              <select
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                aria-label="Jenis blok"
                className="focus:border-navy flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              >
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run('add', () => addBlock(page.id, adding, defaultProps(adding)))
                }
                className="bg-navy inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === 'add' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Tambah
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
          <h3 className="font-semibold text-neutral-900">Pratinjau</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Tautan berlaku satu jam dan hanya untuk halaman ini.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run('preview', async () => {
                const r = await mintPreview(page.id, siteUrl);
                if (r.ok && r.data) setPreviewUrl(r.data.url);
                return r;
              })
            }
            className="text-navy mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <Eye className="h-4 w-4" />
            Buat tautan pratinjau
          </button>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
            >
              {previewUrl}
            </a>
          )}
          <a
            href={`/site/page/${page.id}`}
            className="text-navy mt-4 block text-sm font-semibold hover:underline"
          >
            Alur &amp; riwayat versi →
          </a>
        </section>
      </aside>

      {/* ── right: the selected block's props ── */}
      <div className="min-w-0">
        {!editable && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/70">
            Halaman berstatus <strong>{page.status}</strong>, hanya draf yang bisa diubah.
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200/70">
            {error}
          </p>
        )}

        {!block ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 py-20 text-center text-sm text-neutral-400">
            Pilih blok di kiri untuk menyuntingnya.
          </div>
        ) : (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">
                {TYPE_LABEL[block.type] ?? block.type}
              </h3>
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={block.visible}
                  disabled={!editable || busy !== null}
                  onChange={(e) =>
                    void run(block.id, () =>
                      updateBlock(page.id, block.id, { visible: e.target.checked }),
                    )
                  }
                  className="text-navy h-4 w-4 rounded border-neutral-300"
                />
                Tampilkan
              </label>
            </div>

            <div className="mt-5 space-y-4">
              {JSON_TYPES.has(block.type) ? (
                <div>
                  <label htmlFor="json" className="text-sm font-medium text-neutral-700">
                    Isi (JSON)
                  </label>
                  <p className="mt-1 text-xs text-neutral-500">
                    Daftar item. Disimpan hanya jika bentuknya benar.
                  </p>
                  <textarea
                    id="json"
                    defaultValue={JSON.stringify(block.props, null, 2)}
                    disabled={!editable}
                    rows={14}
                    onBlur={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        void run(block.id, () => updateBlock(page.id, block.id, { props: parsed }));
                      } catch {
                        setError('JSON tidak valid, perbaiki dulu sebelum keluar dari kolom.');
                      }
                    }}
                    className={`${FIELD} font-mono text-xs`}
                  />
                </div>
              ) : (
                (BLOCK_FIELDS[block.type] ?? []).map((field) => (
                  <div key={field.key}>
                    <label htmlFor={field.key} className="text-sm font-medium text-neutral-700">
                      {field.label}
                    </label>
                    {field.hint && <p className="mt-0.5 text-xs text-neutral-500">{field.hint}</p>}

                    {field.type === 'media' ? (
                      <div className="mt-1.5 flex items-center gap-3">
                        {typeof block.props.mediaUrl === 'string' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={block.props.mediaUrl as string}
                            alt=""
                            className="h-14 w-20 rounded-lg object-cover"
                          />
                        )}
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => setPicker({ blockId: block.id, key: field.key })}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
                        >
                          <ImagePlus className="h-4 w-4" />
                          {block.props[field.key] ? 'Ganti' : 'Pilih'}
                        </button>
                      </div>
                    ) : field.type === 'area' ? (
                      <textarea
                        id={field.key}
                        defaultValue={String(block.props[field.key] ?? '')}
                        disabled={!editable}
                        rows={6}
                        onBlur={(e) =>
                          saveProps(block, { [field.key]: e.target.value || undefined })
                        }
                        className={FIELD}
                      />
                    ) : (
                      <input
                        id={field.key}
                        type={field.type === 'number' ? 'number' : 'text'}
                        defaultValue={String(block.props[field.key] ?? '')}
                        disabled={!editable}
                        onBlur={(e) =>
                          saveProps(block, {
                            [field.key]:
                              field.type === 'number'
                                ? Number(e.target.value) || undefined
                                : e.target.value || undefined,
                          })
                        }
                        className={FIELD}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={(asset: MediaAsset) => {
          const target = page.blocks.find((b) => b.id === picker?.blockId);
          if (target && picker) void saveProps(target, { [picker.key]: asset.id });
          setPicker(null);
        }}
        kind="image"
        requireReady={false}
        folder="halaman"
      />
    </div>
  );
}

/**
 * The minimum a new block needs to satisfy its schema.
 *
 * A block is created already valid rather than empty-and-broken: the API's Zod
 * schema requires a heading on a hero, and an editor who adds one should get a
 * block they can then edit, not a 422 they have to decode.
 */
function defaultProps(type: string): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return { heading: 'Judul baru' };
    case 'rich_text':
      return { text: 'Tulis isi di sini.' };
    case 'cta_banner':
      return { heading: 'Ajakan', ctaLabel: 'Konsultasi Gratis', ctaHref: '/register' };
    case 'stat_row':
      return { items: [{ value: '100', label: 'Siswa' }] };
    case 'proof_bar':
      return { items: [{ label: 'Dipercaya sejak 2024' }] };
    case 'steps':
      return { items: [{ title: 'Langkah pertama' }] };
    case 'program_grid':
    case 'article_grid':
      return { limit: 3 };
    case 'faq_accordion':
      return { limit: 8 };
    case 'testimonial_slider':
    case 'mentor_grid':
      return { limit: 4 };
    case 'competition_calendar':
      return { limit: 6 };
    default:
      return {};
  }
}
