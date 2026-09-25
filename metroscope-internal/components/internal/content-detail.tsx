'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { History, RotateCcw, Send } from 'lucide-react';

import { Field, Input, Textarea } from '@/components/ui/field';
import type { ContentItem, ContentVersion } from '@/lib/api';
import { restoreVersion, runAction, type PipelineAction } from '@/lib/site-actions';
import { STATUS_LABEL, STATUS_TONE } from '@/components/internal/content-queue';
import { cn } from '@/lib/utils';

/**
 * Which actions are offered from each state.
 *
 * A mirror of the API's `TRANSITIONS` table, and deliberately only a mirror:
 * this decides what to *draw*, never what is *allowed*. The API re-checks every
 * move and RLS checks it again, so a button rendered in error produces a 409
 * the user can read, not a state change.
 */
const NEXT: Record<
  string,
  { action: PipelineAction; label: string; tone?: 'primary' | 'danger' }[]
> = {
  DRAFT: [{ action: 'submit', label: 'Kirim untuk Review', tone: 'primary' }],
  IN_REVIEW: [
    { action: 'approve', label: 'Setujui', tone: 'primary' },
    { action: 'reject', label: 'Minta Revisi', tone: 'danger' },
  ],
  APPROVED: [
    { action: 'publish', label: 'Terbitkan Sekarang', tone: 'primary' },
    { action: 'schedule', label: 'Jadwalkan' },
  ],
  SCHEDULED: [{ action: 'publish', label: 'Terbitkan Sekarang', tone: 'primary' }],
  PUBLISHED: [{ action: 'unpublish', label: 'Turunkan dari Situs', tone: 'danger' }],
  ARCHIVED: [],
};

/** Actions that must carry a note or a date before they mean anything. */
const NEEDS_NOTE: PipelineAction[] = ['reject'];
const NEEDS_DATE: PipelineAction[] = ['schedule'];

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export function ContentDetail({
  item,
  versions,
}: {
  item: ContentItem;
  versions: ContentVersion[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PipelineAction | null>(null);
  const [note, setNote] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = NEXT[item.status] ?? [];

  const run = async (action: PipelineAction) => {
    // Two-step for anything that needs input; one click for the rest.
    if ((NEEDS_NOTE.includes(action) || NEEDS_DATE.includes(action)) && pending !== action) {
      setPending(action);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await runAction(item.type, item.id, action, {
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(publishAt ? { publishAt: new Date(publishAt).toISOString() } : {}),
    });
    setBusy(false);

    if (!result.ok) return setError(result.error ?? 'Gagal.');
    setPending(null);
    setNote('');
    setPublishAt('');
    router.refresh();
  };

  const restore = async (version: number) => {
    setBusy(true);
    setError(null);
    const result = await restoreVersion(item.type, item.id, version);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal memulihkan.');
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {/* State + actions */}
      <section className="rounded-2xl border border-neutral-200/70 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                STATUS_TONE[item.status],
              )}
            >
              {STATUS_LABEL[item.status]}
            </span>
            {item.publishAt && (
              <p className="mt-2 text-xs text-violet-700">
                Dijadwalkan terbit {formatWhen(item.publishAt)}
              </p>
            )}
            {item.publishedAt && item.status === 'PUBLISHED' && (
              <p className="mt-2 text-xs text-neutral-500">Terbit {formatWhen(item.publishedAt)}</p>
            )}
            {item.reviewNote && (
              <p className="mt-2 max-w-md text-xs text-neutral-600">
                Catatan terakhir: “{item.reviewNote}”
                {item.reviewedByName && (
                  <span className="text-neutral-400">, {item.reviewedByName}</span>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {available.length === 0 && (
              <p className="text-xs text-neutral-400">Tidak ada tindakan dari status ini.</p>
            )}
            {available.map((a) => (
              <button
                key={a.action}
                type="button"
                onClick={() => run(a.action)}
                disabled={busy}
                className={cn(
                  'rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60',
                  a.tone === 'primary' && 'bg-navy hover:bg-navy-dark text-white',
                  a.tone === 'danger' &&
                    'border-maroon/30 text-maroon hover:bg-maroon-light/40 border bg-white',
                  !a.tone &&
                    'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
                )}
              >
                {busy && pending === a.action ? 'Memproses…' : a.label}
              </button>
            ))}
          </div>
        </div>

        {pending && NEEDS_NOTE.includes(pending) && (
          <div className="mt-5">
            <Field
              label="Apa yang perlu diubah?"
              description="Wajib, penulis hanya melihat catatan ini, bukan alasan di kepalamu."
            >
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Mis. harga belum diperbarui untuk semester baru."
              />
            </Field>
            <button
              type="button"
              onClick={() => run(pending)}
              disabled={busy}
              className="bg-navy hover:bg-navy-dark mt-3 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Send className="mr-1.5 inline h-4 w-4" />
              Kirim Revisi
            </button>
          </div>
        )}

        {pending && NEEDS_DATE.includes(pending) && (
          <div className="mt-5">
            <Field label="Terbit pada" description="Harus di masa depan, cron menerbitkannya.">
              <Input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </Field>
            <button
              type="button"
              onClick={() => run(pending)}
              disabled={busy || !publishAt}
              className="bg-navy hover:bg-navy-dark mt-3 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Jadwalkan
            </button>
          </div>
        )}

        {error && (
          <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-4 rounded-xl border p-3 text-xs">
            {error}
          </p>
        )}
      </section>

      {/* SEO now has its own editable panel, `seo-panel.tsx`, rendered by the page. */}

      {/* Version history */}
      <section>
        <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-neutral-900">
          <History className="h-4 w-4 text-neutral-400" aria-hidden />
          Riwayat Versi
        </h2>
        {versions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-xs text-neutral-400">
            Belum pernah terbit, versi ditulis setiap kali konten diterbitkan.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {versions.map((v) => (
              <li
                key={v.version}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200/70 bg-white px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">Versi {v.version}</p>
                  <p className="text-xs text-neutral-400">
                    {formatWhen(v.createdAt)}
                    {v.authorName && ` · ${v.authorName}`}
                    {v.note && ` · ${v.note}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(v.version)}
                  disabled={busy}
                  className="hover:border-navy/40 hover:text-navy flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Pulihkan
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-400">
          Memulihkan mengembalikan isi versi itu sebagai <strong>draf</strong>. Tidak langsung
          terbit. Menerbitkannya adalah keputusan terpisah.
        </p>
      </section>
    </div>
  );
}
