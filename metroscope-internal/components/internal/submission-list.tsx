'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Mail, Phone } from 'lucide-react';

import { markSubmissionHandled } from '@/lib/surface-actions';
import type { FormSubmission } from '@/lib/api';

const WHEN = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Makassar',
});

/** Contact messages, newest first. Rendered WITA like every other timestamp. */
export function SubmissionList({
  items,
  showHandled,
}: {
  items: FormSubmission[];
  showHandled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (id: string, handled: boolean) => {
    setBusy(id);
    await markSubmissionHandled(id, handled);
    setBusy(null);
    router.refresh();
  };

  return (
    <div>
      <div className="flex gap-2">
        <Link
          href="/site/forms"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            !showHandled ? 'bg-navy text-white' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          Baru
        </Link>
        <Link
          href="/site/forms?handled=true"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            showHandled ? 'bg-navy text-white' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          Selesai
        </Link>
      </div>

      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">{item.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                  {item.email && (
                    <a href={`mailto:${item.email}`} className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" aria-hidden />
                      {item.email}
                    </a>
                  )}
                  {item.phone && (
                    <a
                      href={`https://wa.me/${item.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1"
                    >
                      <Phone className="h-3 w-3" aria-hidden />
                      {item.phone}
                    </a>
                  )}
                  <span>{WHEN.format(new Date(item.createdAt))} WITA</span>
                  {item.sourcePath && <span className="text-neutral-400">{item.sourcePath}</span>}
                </p>
              </div>

              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => void toggle(item.id, !item.handled)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold ${
                  item.handled
                    ? 'bg-neutral-100 text-neutral-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {busy === item.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {item.handled ? 'Buka lagi' : 'Tandai selesai'}
              </button>
            </div>

            <p className="mt-3 leading-relaxed whitespace-pre-wrap text-neutral-700">
              {item.message}
            </p>
            {item.handled && item.handledByName && (
              <p className="mt-2 text-xs text-neutral-400">Ditangani {item.handledByName}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
