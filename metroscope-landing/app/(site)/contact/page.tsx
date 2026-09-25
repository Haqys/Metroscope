import type { Metadata } from 'next';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';

import { ContactForm } from '@/components/marketing/contact-form';
import { FULL_ADDRESS, ORGANIZATION } from '@/lib/organization';
import { STANDALONE } from '@/lib/standalone';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION = 'Alamat, jam kerja, dan formulir pesan Metroscope di Denpasar, Bali.';
const URL = absolute('/contact');
const SOCIAL = social({ title: 'Hubungi Kami · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Hubungi Kami',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * `/contact`, doc 13 §16: "Missing, no address, no map, no hours, no WA
 * deep-link page", and §19.1: "Address · map · hours · WA · form".
 *
 * A first-party route rather than a CMS page, deliberately. doc 13 §9.2 puts
 * Contact among the Tier-1 SINGLETONS, and the form is a real component with a
 * server route behind it, not something a block editor composes. An editor who
 * wants the form elsewhere adds a `contact_form` block to any CMS page; this
 * route is the address people are given.
 *
 * The contact DETAILS come from the environment through
 * `lib/organization.ts`, which the `Organization` JSON-LD also reads, so an
 * address cannot disagree with its own structured data. They belong in
 * `/settings/website` (doc 13 §9.4, Tier 1) once that exists, recorded in doc
 * 14 §2.7 rather than papered over with a table invented for four fields.
 */
/**
 * ⚠️ Each of these is null until configured, and a null renders nothing.
 *
 * They used to be literals, and the email among them (`halo@metroscope.id`)
 * sat on a domain that is not registered. See `lib/organization.ts`.
 */
const OFFICE = {
  address: FULL_ADDRESS,
  hours: ORGANIZATION.hours,
  phone: ORGANIZATION.phone,
  email: ORGANIZATION.email,
};

const HAS_ANY_DETAIL = Boolean(OFFICE.address || OFFICE.hours || OFFICE.phone || OFFICE.email);

export default function ContactPage() {
  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Kontak</p>
      <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
        Mari Berkenalan.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
        Punya pertanyaan tentang program, jadwal, atau biaya? Kirim pesan. Kami balas di jam kerja.
      </p>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <div>
          <dl className="space-y-7">
            {OFFICE.address && (
              <div className="flex gap-4">
                <MapPin className="text-maroon mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                    Alamat
                  </dt>
                  <dd className="mt-1 text-neutral-700">{OFFICE.address}</dd>
                </div>
              </div>
            )}

            {OFFICE.hours && (
              <div className="flex gap-4">
                <Clock className="text-maroon mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                    Jam kerja
                  </dt>
                  <dd className="mt-1 text-neutral-700">{OFFICE.hours}</dd>
                </div>
              </div>
            )}

            {OFFICE.phone && (
              <div className="flex gap-4">
                <Phone className="text-maroon mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                    WhatsApp
                  </dt>
                  <dd className="mt-1">
                    {/*
                    A `wa.me` deep link, which doc 13 §19.1 asks for. This is not
                    the WhatsApp Business API. That channel was removed from the
                    product (CLAUDE.md, 2026-07-29). It opens the reader's own
                    WhatsApp; nothing is sent by us and no number is stored.
                  */}
                    <a
                      href={`https://wa.me/${OFFICE.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-navy underline-offset-2 hover:underline"
                    >
                      {OFFICE.phone}
                    </a>
                  </dd>
                </div>
              </div>
            )}

            {OFFICE.email && (
              <div className="flex gap-4">
                <Mail className="text-maroon mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">
                    Email
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${OFFICE.email}`}
                      className="text-navy underline-offset-2 hover:underline"
                    >
                      {OFFICE.email}
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>

          {/*
            Saying so beats an empty column. A contact page with no channels is
            a real state here (nothing is configured yet), and silence would
            read as a rendering fault.
          */}
          {!HAS_ANY_DETAIL && (
            <p className="rounded-2xl border border-dashed border-neutral-300 px-5 py-6 text-sm leading-relaxed text-neutral-500">
              {STANDALONE
                ? 'Detail kontak sedang disiapkan dan akan tampil di sini begitu tersedia.'
                : 'Detail kontak sedang disiapkan. Sementara ini, gunakan formulir di samping untuk mengirim pesan.'}
            </p>
          )}
        </div>

        <ContactForm
          heading="Kirim pesan"
          text="Kami balas ke email atau WhatsApp yang Anda tulis."
        />
      </div>
    </div>
  );
}
