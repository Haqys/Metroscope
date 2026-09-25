'use client';

import { ArrowUpRight, Info } from 'lucide-react';

import { CONTACT, mailtoLink, whatsappLink } from '@/lib/standalone';

/**
 * What a form shows instead of a submit button while there is no API.
 *
 * The alternative was to leave the button, let it post, and let the route
 * answer 503. That is not a dead end exactly, the error is honest, but it
 * spends the visitor's intent on a failure: they filled in a form, pressed
 * send, and got an apology. This says so before they start, and hands them a
 * channel that works.
 *
 * When no contact channel is configured either, it says only what is true.
 * Offering a `mailto:` for an address that bounces is how the previous version
 * of this site lost enquiries twice over.
 */
export function StandaloneSubmitNotice({
  title = 'Pengiriman online belum aktif',
  description,
  mailSubject,
  mailBody,
  whatsappText,
}: {
  title?: string;
  description: string;
  mailSubject: string;
  mailBody?: string;
  whatsappText?: string;
}) {
  const mail = mailtoLink(mailSubject, mailBody);
  const wa = whatsappLink(whatsappText ?? mailSubject);

  return (
    <div className="border-navy/20 bg-navy-light/40 mt-6 rounded-2xl border p-5">
      <div className="flex gap-3">
        <Info className="text-navy mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            {description}
            {(mail || wa) && ' Gunakan kanal di bawah untuk menghubungi tim Metroscope.'}
          </p>

          {(mail || wa) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {mail && (
                <a
                  href={mail}
                  className="bg-navy inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Kirim lewat email
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </a>
              )}
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-navy text-navy hover:bg-navy inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors hover:text-white"
                >
                  Hubungi via WhatsApp
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </a>
              )}
            </div>
          )}

          {!mail && !wa && (
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">
              {CONTACT.instagram
                ? 'Kanal kontak sedang disiapkan. Sementara ini, hubungi kami lewat Instagram.'
                : 'Kanal kontak sedang disiapkan dan akan tampil di sini begitu tersedia.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
