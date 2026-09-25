'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, ImageOff, Plus, Search, Star } from 'lucide-react';

import { EmptyState } from '@/components/ui/states';
import { createArticle } from '@/lib/article-actions';
import type { ArticleCategory, ArticleListItem, ArticleTag } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draf', tone: 'bg-neutral-100 text-neutral-600' },
  IN_REVIEW: { label: 'Menunggu Review', tone: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Disetujui', tone: 'bg-sky-50 text-sky-700' },
  SCHEDULED: { label: 'Terjadwal', tone: 'bg-violet-50 text-violet-700' },
  PUBLISHED: { label: 'Terbit', tone: 'bg-emerald-50 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', tone: 'bg-neutral-100 text-neutral-400' },
};

export function ArticleList({
  items,
  total,
  categories,
  tags,
  filters,
}: {
  items: ArticleListItem[];
  total: number;
  categories: ArticleCategory[];
  tags: (ArticleTag & { articleCount: number })[];
  filters: { q?: string; status?: string; categoryId?: string; tagId?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? '');
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`/site/articles?${next}`));
  };

  /**
   * Creating an article makes a real DRAFT row and goes straight to it.
   *
   * An inline field rather than a modal: the title is the only thing needed,
   * and a dialog to collect one string is a step the editor then repeats.
   */
  const onCreate = async () => {
    const title = draftTitle.trim();
    if (title.length < 3) return setError('Judul minimal 3 karakter.');
    setCreating(true);
    setError(null);
    const result = await createArticle({ title });
    setCreating(false);
    if (!result.ok || !result.data) return setError(result.error ?? 'Gagal membuat artikel.');
    setDraftTitle('');
    router.push(`/site/articles/${result.data.id}`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setParam('q', q.trim())}
            placeholder="Cari judul artikel…"
            aria-label="Cari artikel"
            className="focus:border-navy focus:ring-navy/20 w-full rounded-full border border-neutral-300 py-2.5 pr-4 pl-9 text-sm"
          />
        </div>

        <select
          value={filters.status ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Saring status"
          className="rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
        >
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.categoryId ?? ''}
          onChange={(e) => setParam('categoryId', e.target.value)}
          aria-label="Saring kategori"
          className="rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filters.tagId ?? ''}
          onChange={(e) => setParam('tagId', e.target.value)}
          aria-label="Saring tag"
          className="rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
        >
          <option value="">Semua tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.articleCount})
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onCreate();
            }
          }}
          placeholder="Judul artikel baru…"
          aria-label="Judul artikel baru"
          className="focus:border-navy focus:ring-navy/20 flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={creating || draftTitle.trim().length < 3}
          className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Artikel Baru
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200/70">
          {error}
        </p>
      )}

      <p className="mt-4 text-xs text-neutral-500">
        {total} artikel{total !== items.length && ` · menampilkan ${items.length}`}
      </p>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Belum ada artikel"
            description="Mulai dari prestasi siswa terbaru, cerita yang paling dicari orang tua."
          />
        </div>
      ) : (
        <ul className={cn('mt-4 space-y-3', pending && 'opacity-60')}>
          {items.map((a) => {
            const status = STATUS_LABEL[a.status] ?? STATUS_LABEL.DRAFT!;
            return (
              <li key={a.id}>
                <Link
                  href={`/site/articles/${a.id}`}
                  className="hover:border-navy/40 flex gap-4 rounded-2xl border border-neutral-200 bg-white p-4 transition-colors"
                >
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    {a.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.coverUrl}
                        alt={a.coverAlt ?? ''}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-300">
                        <ImageOff className="h-5 w-5" aria-hidden />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          status.tone,
                        )}
                      >
                        {status.label}
                      </span>
                      {a.featured && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <Star className="h-3 w-3 fill-current" aria-hidden />
                          Unggulan
                        </span>
                      )}
                      {a.categoryName && (
                        <span className="text-[11px] text-neutral-500">{a.categoryName}</span>
                      )}
                    </div>

                    <h3 className="mt-1 truncate font-semibold text-neutral-900">{a.title}</h3>
                    {a.excerpt && (
                      <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{a.excerpt}</p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden />
                        {a.readingMin} menit
                      </span>
                      {a.authorName && <span>{a.authorName}</span>}
                      {a.tags.length > 0 && <span>{a.tags.map((t) => t.name).join(' · ')}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
