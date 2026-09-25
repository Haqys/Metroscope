'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { createPage } from '@/lib/page-actions';

/** Inline field, not a modal, a title is the only thing a new page needs. */
export function NewPageButton() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const clean = title.trim();
    if (clean.length < 2) return setError('Judul minimal 2 karakter.');
    setBusy(true);
    setError(null);
    const result = await createPage(clean);
    setBusy(false);
    if (!result.ok || !result.data) return setError(result.error ?? 'Gagal membuat halaman.');
    router.push(`/site/pages/${result.data.id}`);
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void create();
            }
          }}
          placeholder="Judul halaman baru…"
          aria-label="Judul halaman baru"
          className="focus:border-navy flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy || title.trim().length < 2}
          className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Halaman Baru
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
