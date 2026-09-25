'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { STANDALONE } from '@/lib/standalone';
import { StandaloneSubmitNotice } from '@/components/marketing/standalone-notice';

/**
 * The public contact form (doc 13 §9.4, submissions land in `/site/forms`).
 *
 * Posts to the landing app's own `/api/contact`, which forwards to the API.
 * The browser never calls `api.metroscope.id` directly, doc 04 §3.2, and
 * this form is no exception just because it carries no session.
 *
 * The honeypot is a real input, positioned off-screen rather than
 * `display: none`: some bots skip hidden fields, and `aria-hidden` plus
 * `tabIndex={-1}` keeps it away from assistive technology and keyboard users
 * without hiding it from a naive script. The server answers a filled honeypot
 * with success and stores nothing, a bot told "rejected" retries.
 */
export function ContactForm({ heading, text }: { heading?: string; text?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState('sending');
    setError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? '') || undefined,
          phone: String(form.get('phone') ?? '') || undefined,
          message: String(form.get('message') ?? ''),
          website: String(form.get('website') ?? '') || undefined,
          sourcePath: window.location.pathname,
        }),
      });

      if (res.status === 429) {
        setState('idle');
        setError('Terlalu banyak pesan dari perangkat ini. Coba lagi nanti.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setState('idle');
        setError(
          body?.error?.details?.issues?.[0]?.message ??
            body?.error?.message ??
            'Pesan gagal dikirim. Coba lagi.',
        );
        return;
      }
      setState('sent');
    } catch {
      setState('idle');
      setError('Tidak bisa terhubung. Periksa koneksi lalu coba lagi.');
    }
  };

  if (state === 'sent') {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-8 py-12 text-center">
        <Check className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
        <h3 className="mt-3 font-serif text-2xl font-medium text-neutral-900">Pesan terkirim</h3>
        <p className="mt-2 text-neutral-600">
          Kami membalas pada jam kerja, biasanya di hari yang sama.
        </p>
      </div>
    );
  }

  const field =
    'focus:border-navy focus:ring-navy/20 mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm';

  return (
    <form onSubmit={submit} className="rounded-3xl border border-neutral-200 bg-white p-6 sm:p-8">
      {heading && (
        <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
          {heading}
        </h2>
      )}
      {text && <p className="mt-2 text-sm text-neutral-500">{text}</p>}

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Nama
          </label>
          <input id="name" name="name" required minLength={2} maxLength={120} className={field} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="text-sm font-medium text-neutral-700">
              Email
            </label>
            <input id="email" name="email" type="email" maxLength={200} className={field} />
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-medium text-neutral-700">
              WhatsApp / telepon
            </label>
            <input id="phone" name="phone" type="tel" maxLength={30} className={field} />
          </div>
        </div>
        <p className="text-xs text-neutral-500">Isi salah satu supaya kami bisa membalas.</p>

        <div>
          <label htmlFor="message" className="text-sm font-medium text-neutral-700">
            Pesan
          </label>
          <textarea
            id="message"
            name="message"
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            className={field}
          />
        </div>

        {/* Honeypot. Off-screen, not display:none, see the component comment. */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {STANDALONE ? (
        <StandaloneSubmitNotice
          description="Formulir ini belum terhubung ke sistem Metroscope, jadi pesan di atas belum akan terkirim."
          mailSubject="Pertanyaan tentang program Metroscope"
        />
      ) : (
        <button
          type="submit"
          disabled={state === 'sending'}
          className="bg-navy mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Kirim pesan
        </button>
      )}
    </form>
  );
}
