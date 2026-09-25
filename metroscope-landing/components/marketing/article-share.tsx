'use client';

import { useState } from 'react';
import { Check, Link2, Send } from 'lucide-react';

/**
 * Share row. WhatsApp and copy-link (doc 13 §10.10).
 *
 * §10.10 recommends shipping share over comments: the audience is parents of
 * minors, so a comment thread is a permanent moderation cost and a child-safety
 * surface. WhatsApp is the channel this audience actually forwards in.
 *
 * A `wa.me` link is not the WhatsApp Business API, the product removed that
 * channel (CLAUDE.md, 2026-07-29). This opens the reader's own WhatsApp with
 * text prefilled; nothing is sent by us and no number is stored.
 */
export function ShareRow({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (insecure context, or the user said no). The WhatsApp
      // link still works, so there is nothing worth interrupting them about.
    }
  };

  const wa = `https://wa.me/?text=${encodeURIComponent(`${title}\n\n${url}`)}`;

  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-8">
      <span className="text-xs tracking-[0.2em] text-neutral-400 uppercase">Bagikan</span>
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400"
      >
        <Send className="h-4 w-4" aria-hidden />
        WhatsApp
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" aria-hidden />
        ) : (
          <Link2 className="h-4 w-4" aria-hidden />
        )}
        {copied ? 'Tersalin' : 'Salin tautan'}
      </button>
    </div>
  );
}
