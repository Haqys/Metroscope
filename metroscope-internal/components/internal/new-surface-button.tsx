'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { createFaq, createMentor, createTestimonial } from '@/lib/surface-actions';

/**
 * Create a row in one of the §2.7 collections.
 *
 * Each type asks for the minimum that makes a usable draft, and no more, the
 * editor fills the rest in the form. A mentor is the exception: it needs a
 * staff ACCOUNT, because a mentor profile is a public face for somebody who
 * works here, and the API refuses a guardian account outright.
 */
export function NewSurfaceButton({ type }: { type: string }) {
  const router = useRouter();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type !== 'mentor') return;
    fetch('/api/bff/users?limit=100')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setStaff(body?.data?.items ?? []))
      .catch(() => setStaff([]));
  }, [type]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const result =
      type === 'faq'
        ? await createFaq(a.trim(), b.trim())
        : type === 'testimonial'
          ? await createTestimonial(b.trim(), a.trim())
          : await createMentor(a, b.trim());
    setBusy(false);
    if (!result.ok || !result.data) return setError(result.error ?? 'Gagal membuat.');
    router.push(`/site/collections/${type}/${result.data.id}`);
  };

  const field =
    'focus:border-navy focus:ring-navy/20 flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm';

  const ready =
    type === 'mentor'
      ? a.length > 0 && b.trim().length >= 2
      : a.trim().length >= 3 && b.trim().length >= 3;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {type === 'mentor' ? (
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            aria-label="Akun tim"
            className={field}
          >
            <option value="">, pilih akun tim, </option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder={type === 'faq' ? 'Pertanyaan…' : 'Nama orang tua…'}
            aria-label={type === 'faq' ? 'Pertanyaan' : 'Nama'}
            className={field}
          />
        )}

        <input
          value={b}
          onChange={(e) => setB(e.target.value)}
          placeholder={
            type === 'faq' ? 'Jawaban…' : type === 'testimonial' ? 'Kutipan…' : 'Nama tampil…'
          }
          aria-label="Isi"
          className={field}
        />

        <button
          type="button"
          onClick={create}
          disabled={busy || !ready}
          className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Tambah
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
