'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { deleteCategory, deleteTag, saveCategory, upsertTag } from '@/lib/article-actions';
import type { ArticleCategory, ArticleTag } from '@/lib/api';

/**
 * Category and tag management (doc 13 §10.3).
 *
 * Buttons are hidden from an author who cannot use them, but that is courtesy,
 * not enforcement: the API requires `content.review` on every write here and
 * RLS refuses the row underneath. Hiding a control the server would reject
 * saves a confusing 403; it is never what makes the rule true.
 */
export function TaxonomyManager({
  categories,
  tags,
  canManageCategories,
}: {
  categories: ArticleCategory[];
  tags: (ArticleTag & { articleCount: number })[];
  canManageCategories: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (!result.ok) return setError(result.error ?? 'Gagal.');
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200/70">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-semibold text-neutral-900">Kategori</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Satu kategori per artikel. Kategori muncul di navigasi situs, jadi hanya reviewer yang
          bisa mengubahnya.
        </p>

        <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900">{c.name}</p>
                <p className="truncate text-xs text-neutral-400">
                  /{c.slug} · {c.articleCount} artikel
                </p>
              </div>
              {canManageCategories && (
                <button
                  type="button"
                  aria-label={`Hapus kategori ${c.name}`}
                  disabled={busy === c.id}
                  onClick={() => void run(c.id, () => deleteCategory(c.id))}
                  className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  {busy === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>

        {canManageCategories && (
          <div className="mt-3 flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || newCategory.trim().length < 2) return;
                e.preventDefault();
                const name = newCategory.trim();
                setNewCategory('');
                void run('new-category', () => saveCategory({ name }));
              }}
              placeholder="Nama kategori baru…"
              aria-label="Nama kategori baru"
              className="focus:border-navy flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
            />
            <button
              type="button"
              disabled={newCategory.trim().length < 2 || busy === 'new-category'}
              onClick={() => {
                const name = newCategory.trim();
                setNewCategory('');
                void run('new-category', () => saveCategory({ name }));
              }}
              className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Tambah
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-neutral-900">Tag</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Bebas dan lintas kategori. Penulis bisa membuat tag sambil menulis; menghapusnya tidak
          merusak apa pun selain halaman kumpulan tag itu.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700"
            >
              {t.name}
              <span className="text-xs text-neutral-400">{t.articleCount}</span>
              {canManageCategories && (
                <button
                  type="button"
                  aria-label={`Hapus tag ${t.name}`}
                  disabled={busy === t.id}
                  onClick={() => void run(t.id, () => deleteTag(t.id))}
                  className="text-neutral-400 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          {tags.length === 0 && <p className="text-sm text-neutral-400">Belum ada tag.</p>}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !newTag.trim()) return;
              e.preventDefault();
              const name = newTag.trim();
              setNewTag('');
              void run('new-tag', () => upsertTag(name));
            }}
            placeholder="Nama tag baru…"
            aria-label="Nama tag baru"
            className="focus:border-navy flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={!newTag.trim() || busy === 'new-tag'}
            onClick={() => {
              const name = newTag.trim();
              setNewTag('');
              void run('new-tag', () => upsertTag(name));
            }}
            className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>
      </section>
    </div>
  );
}
