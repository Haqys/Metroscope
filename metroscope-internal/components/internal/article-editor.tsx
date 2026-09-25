'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import {
  Bold,
  Check,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Quote,
  X,
} from 'lucide-react';

import { MediaPicker } from '@/components/internal/media-picker';
import { saveArticleDraft, upsertTag } from '@/lib/article-actions';
import type { Article, ArticleCategory, ArticleTag, MediaAsset, ProseNode } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Article editor (doc 13 §10.4, doc 14 §2.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The body is a TipTap document and what gets saved is its JSON AST, never
 * HTML. That is the decision the whole editor hangs off: HTML from a rich-text
 * field is a sanitising liability forever, and it cannot be rendered
 * structurally, the public site wants to lay out an image differently from a
 * paragraph, and it can only do that if it receives nodes.
 *
 * Editing is confined to DRAFT. Everything else, submit, approve, publish,
 * is the shared pipeline UI on the content detail page, unchanged from 2.1.
 */

/**
 * The image node carries `mediaId` in its attrs.
 *
 * This is the contract with `media_usage`: the server reads ids out of the AST
 * to record what an article uses. A `src` alone would not do, a signed URL
 * expires and a public one can be rewritten, but the id is the fact.
 */
const MediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        renderHTML: (attrs) => (attrs.mediaId ? { 'data-media-id': attrs.mediaId } : {}),
        parseHTML: (el) => el.getAttribute('data-media-id'),
      },
    };
  },
});

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'rounded-lg p-2 transition-colors',
        active ? 'bg-navy text-white' : 'text-neutral-600 hover:bg-neutral-100',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 p-2">
      <ToolbarButton
        title="Tebal"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Miring"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton
        title="Judul bagian"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Sub-judul"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton
        title="Daftar poin"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Daftar bernomor"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Kutipan"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-neutral-200" />
      <ToolbarButton
        title="Tautan"
        active={editor.isActive('link')}
        onClick={() => {
          const previous = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('Alamat tautan', previous ?? 'https://');
          if (url === null) return;
          if (url === '') return void editor.chain().focus().unsetLink().run();
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Sisipkan gambar" onClick={onPickImage}>
        <ImagePlus className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export function ArticleEditor({
  article,
  categories,
  allTags,
  me,
}: {
  article: Article;
  categories: ArticleCategory[];
  allTags: ArticleTag[];
  /** The signed-in editor, the only byline this picker offers. */
  me: { id: string; name: string };
}) {
  const router = useRouter();
  const editable = article.status === 'DRAFT';

  const [title, setTitle] = useState(article.title);
  const [subtitle, setSubtitle] = useState(article.subtitle ?? '');
  const [excerpt, setExcerpt] = useState(article.excerpt ?? '');
  const [categoryId, setCategoryId] = useState(article.categoryId ?? '');
  const [authorId, setAuthorId] = useState(article.authorId ?? '');
  const [featured, setFeatured] = useState(article.featured);
  const [cover, setCover] = useState<{ id: string; url: string | null; alt: string | null } | null>(
    article.coverId ? { id: article.coverId, url: article.coverUrl, alt: article.coverAlt } : null,
  );
  const [tags, setTags] = useState<ArticleTag[]>(article.tags);
  const [tagDraft, setTagDraft] = useState('');
  const [picker, setPicker] = useState<null | 'cover' | 'inline'>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      MediaImage,
      Link.configure({ openOnClick: false }),
    ],
    content: article.body as never,
    /**
     * Next hydrates this on the server first, and ProseMirror's DOM is built
     * from the browser's own parsing, so the two disagree unless we opt out.
     */
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none px-4 py-3 min-h-[22rem] focus:outline-none',
      },
    },
  });

  /**
   * Save on a pause, not on every keystroke.
   *
   * The body of an article is large and the derived work behind each save is
   * real, reading time, `media_usage` reconciliation, tag diffing, all inside
   * a transaction. Firing that per character would keep a write transaction
   * open more or less continuously on the row somebody is editing.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  /**
   * The save reads the form from a ref, not from its own closure.
   *
   * Every field handler calls `setX(...)` and then `queueSave()` in the same
   * tick. `queueSave` belongs to the render that is being replaced, so the
   * `save` it schedules closes over the values from BEFORE the edit, the
   * timer fires 1.2s later and PATCHes the old text while the UI reports
   * "Tersimpan". The first edit after opening an article sent its original
   * subtitle back, silently discarding what had just been typed.
   *
   * Written during render on purpose: the ref must hold what is on screen now,
   * and an effect would update it a commit too late.
   */
  const form = useRef({ title, subtitle, excerpt, categoryId, authorId, featured, cover, tags });
  form.current = { title, subtitle, excerpt, categoryId, authorId, featured, cover, tags };

  const save = useCallback(async () => {
    if (!editable || !editor) return;
    dirty.current = false;
    setState('saving');
    setError(null);

    const current = form.current;
    const result = await saveArticleDraft(article.id, {
      title: current.title.trim(),
      subtitle: current.subtitle.trim() || null,
      excerpt: current.excerpt.trim() || null,
      body: editor.getJSON() as ProseNode,
      coverId: current.cover?.id ?? null,
      categoryId: current.categoryId || null,
      authorId: current.authorId || null,
      featured: current.featured,
      tagIds: current.tags.map((t) => t.id),
    });

    if (!result.ok) {
      setState('idle');
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    setState('saved');
    // Reading time and the slug are computed server-side; refresh to show them.
    router.refresh();
  }, [article.id, editable, editor, router]);

  const queueSave = useCallback(() => {
    if (!editable) return;
    dirty.current = true;
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
  }, [editable, save]);

  useEffect(() => {
    if (!editor) return;
    editor.on('update', queueSave);
    return () => {
      editor.off('update', queueSave);
    };
  }, [editor, queueSave]);

  /** An unsaved pause must not be lost to a navigation. */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const addTag = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setTagDraft('');
    const existing = allTags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (!tags.some((t) => t.id === existing.id)) setTags((prev) => [...prev, existing]);
      queueSave();
      return;
    }
    const result = await upsertTag(clean);
    if (!result.ok || !result.data) return setError(result.error ?? 'Gagal membuat tag.');
    const tag = result.data;
    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    queueSave();
  };

  const onPick = (asset: MediaAsset) => {
    if (picker === 'cover') {
      setCover({ id: asset.id, url: asset.url, alt: asset.alt });
      if (!asset.isReady) setError('Gambar ini belum punya teks alternatif, lengkapi di Media.');
    } else if (editor) {
      editor
        .chain()
        .focus()
        .setImage({ src: asset.url, alt: asset.alt ?? '', mediaId: asset.id } as never)
        .run();
    }
    setPicker(null);
    queueSave();
  };

  const readingHint = useMemo(
    () =>
      `${article.readingMin} menit baca · ${article.version > 0 ? `versi ${article.version}` : 'belum pernah terbit'}`,
    [article.readingMin, article.version],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        {!editable && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/70">
            Artikel berstatus <strong>{article.status}</strong>, hanya draf yang bisa diubah.
            Kembalikan ke draf dari panel alur kerja untuk menyunting.
          </p>
        )}

        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queueSave();
          }}
          disabled={!editable}
          placeholder="Judul artikel"
          className="w-full border-0 bg-transparent p-0 text-3xl font-bold tracking-tight text-neutral-900 placeholder:text-neutral-300 focus:ring-0 focus:outline-none disabled:text-neutral-500"
        />
        <input
          value={subtitle}
          onChange={(e) => {
            setSubtitle(e.target.value);
            queueSave();
          }}
          disabled={!editable}
          placeholder="Sub-judul (opsional)"
          className="mt-2 w-full border-0 bg-transparent p-0 text-lg text-neutral-600 placeholder:text-neutral-300 focus:ring-0 focus:outline-none"
        />

        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {editor && editable && (
            <Toolbar editor={editor} onPickImage={() => setPicker('inline')} />
          )}
          <EditorContent editor={editor} />
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
          <span>{readingHint}</span>
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
                    onClick={() => setPicker('cover')}
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
              onClick={() => setPicker('cover')}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-6 text-sm text-neutral-500 hover:border-neutral-400 disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              Pilih dari Media
            </button>
          )}
        </section>

        {/*
          The excerpt is the card copy AND the meta description, so an article
          without one renders an empty card and lets a search engine invent the
          snippet. Given its own field rather than auto-truncated from the body:
          the first sentence of an article is rarely the sentence that sells it.
        */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <label htmlFor="excerpt" className="text-sm font-semibold text-neutral-900">
            Ringkasan
          </label>
          <p className="mt-1 text-xs text-neutral-500">
            Muncul di kartu artikel dan hasil pencarian Google.
          </p>
          <textarea
            id="excerpt"
            value={excerpt}
            disabled={!editable}
            maxLength={500}
            rows={4}
            onChange={(e) => {
              setExcerpt(e.target.value);
              queueSave();
            }}
            placeholder="Satu-dua kalimat yang membuat orang tua ingin membaca…"
            className="focus:border-navy mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-right text-xs text-neutral-400">{excerpt.length}/500</p>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <label htmlFor="category" className="text-sm font-semibold text-neutral-900">
            Kategori
          </label>
          <select
            id="category"
            value={categoryId}
            disabled={!editable}
            onChange={(e) => {
              setCategoryId(e.target.value);
              queueSave();
            }}
            className="focus:border-navy mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">, tanpa kategori, </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/**
           * The byline (§3.7).
           *
           * The editor had no author picker at all, which was invisible while
           * `createArticle` defaulted `author_id` to whoever clicked "new".
           * An auto-drafted achievement has no author by design, the mentor
           * who recorded the win did not write it, so without this field the
           * AUTHOR_REQUIRED check at submit would be unsatisfiable from the UI.
           */}
          <label htmlFor="author" className="mt-4 block text-sm font-semibold text-neutral-900">
            Penulis
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-700">
              {authorId ? (article.authorName ?? me.name) : 'Belum ditentukan'}
            </span>
            {editable && authorId !== me.id ? (
              <button
                type="button"
                onClick={() => {
                  setAuthorId(me.id);
                  queueSave();
                }}
                className="text-navy hover:bg-navy-light rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Jadikan saya penulisnya
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Wajib sebelum artikel diajukan review, namanya tampil di halaman publik. Kamu hanya bisa
            menuliskan namamu sendiri.
          </p>

          <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={featured}
              disabled={!editable}
              onChange={(e) => {
                setFeatured(e.target.checked);
                queueSave();
              }}
              className="text-navy focus:ring-navy/30 h-4 w-4 rounded border-neutral-300"
            />
            Tampilkan sebagai unggulan
          </label>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Tag</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
              >
                {t.name}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Hapus tag ${t.name}`}
                    onClick={() => {
                      setTags((prev) => prev.filter((x) => x.id !== t.id));
                      queueSave();
                    }}
                    className="text-neutral-400 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {tags.length === 0 && <span className="text-xs text-neutral-400">Belum ada tag.</span>}
          </div>
          {editable && (
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addTag(tagDraft);
                }
              }}
              list="known-tags"
              placeholder="Tambah tag lalu Enter…"
              className="focus:border-navy mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
          )}
          <datalist id="known-tags">
            {allTags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
          <h3 className="font-semibold text-neutral-900">Alur kerja</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Ajukan review, jadwalkan, dan terbitkan dari halaman konten, sama seperti jenis konten
            lain.
          </p>
          <a
            href={`/site/article/${article.id}`}
            className="text-navy mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <Eye className="h-4 w-4" />
            Buka alur & riwayat versi
          </a>
        </section>
      </aside>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={onPick}
        kind="image"
        requireReady={false}
        folder="artikel"
      />
    </div>
  );
}
