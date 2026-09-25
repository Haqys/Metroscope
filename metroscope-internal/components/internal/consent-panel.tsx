'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';

import { saveContentConsent } from '@/lib/surface-actions';

/**
 * The consent record (doc 13 §9.4, doc 14 §3.7).
 *
 * An article that names a child may not be published without one,
 * `assertArticleReady` refuses the transition, so this panel is not the gate.
 * It is where the person who holds `content.publish` writes down that the
 * conversation happened, in their own words.
 *
 * Shown only for content that names a student, because that is exactly when the
 * rule applies. An article about a competition in general, or a programme, has
 * nobody to ask.
 */
export function ConsentPanel({
  type,
  id,
  studentName,
  consentSource,
  consentAt,
}: {
  type: string;
  id: string;
  studentName: string | null;
  consentSource: string | null;
  consentAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(consentSource ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await saveContentConsent(type, id, value.trim() || null);
      if (!result.ok) {
        setError(result.error ?? 'Gagal menyimpan.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const recorded = Boolean(consentSource?.trim());

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        {recorded ? (
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
        ) : (
          <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden />
        )}
        Izin Orang Tua
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        Artikel ini menyebut{' '}
        <strong className="font-semibold text-neutral-700">{studentName ?? 'seorang siswa'}</strong>
        . Tulis dari mana izinnya didapat, artikel tidak bisa terbit tanpa ini.
      </p>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Mis. WhatsApp Bunda Rani, 3 Agustus 2026"
        aria-label="Catatan izin orang tua"
        className="focus:border-navy mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || value.trim() === (consentSource ?? '')}
          onClick={submit}
          className="bg-navy hover:bg-navy-dark rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
        >
          {pending ? 'Menyimpan…' : 'Simpan Catatan Izin'}
        </button>
        {consentAt ? (
          <span className="text-xs text-neutral-400">
            Dicatat {new Date(consentAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' })}
          </span>
        ) : null}
        {saved ? <span className="text-xs font-medium text-emerald-600">Tersimpan ✓</span> : null}
      </div>

      {error ? <p className="text-maroon mt-2 text-xs">{error}</p> : null}
    </section>
  );
}
