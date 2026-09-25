import type { Metadata } from 'next';
import Link from 'next/link';

import { FaqList } from '@/components/marketing/faq-list';
import { JsonLd } from '@/components/marketing/json-ld';
import { EmptyState } from '@/components/ui/states';
import { listFaq, type FaqEntry } from '@/lib/surfaces-api';
import { absolute, breadcrumbList, social } from '@/lib/seo';

const TITLE = 'Pertanyaan Umum';
const DESCRIPTION =
  'Jawaban atas pertanyaan yang paling sering ditanyakan orang tua sebelum mendaftar di Metroscope.';
const URL = absolute('/faq');

const SOCIAL = social({ title: `${TITLE} · Metroscope`, description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * `FAQPage`, doc 13 §5.2, and the reason §9.4 says the FAQ collection is
 * "used on /faq + portal Help + JSON-LD".
 *
 * Built from the same published rows the page renders, so the structured data
 * cannot drift from what a visitor reads, which is the failure mode this
 * markup is policed for: Google requires the answer in the markup to be the
 * answer visible on the page, and a hand-maintained second copy is how a site
 * ends up shipping an answer it retracted six months ago.
 *
 * Answers are plain text in the CMS, so there is no markup to strip.
 */
function faqPageJsonLd(entries: FaqEntry[]) {
  if (entries.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/**
 * `/faq`, doc 13 §16 listed it as missing, with "every objection currently
 * goes to WhatsApp" as the cost.
 *
 * Entries come from the CMS and only published ones are returned, the filter
 * is `faq_entries_select_public`, not a predicate written here.
 */
export default async function FaqPage() {
  const entries = await listFaq();

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <JsonLd
        docs={[
          faqPageJsonLd(entries),
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: TITLE, path: '/faq' },
          ]),
        ]}
      />
      <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Bantuan</p>
      <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
        Pertanyaan Umum.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
        Kalau jawabannya belum ada di sini, kirim pesan. Kami balas di jam kerja.
      </p>

      <div className="mt-14 max-w-3xl">
        {entries.length === 0 ? (
          <EmptyState
            title="Belum ada pertanyaan"
            description="Halaman ini terisi begitu tim menerbitkan jawaban pertama."
          />
        ) : (
          <FaqList entries={entries} />
        )}
      </div>

      <div className="mt-16 max-w-3xl rounded-3xl bg-neutral-50 px-8 py-10 text-center">
        <h2 className="font-serif text-2xl font-medium text-neutral-900">Masih ada pertanyaan?</h2>
        <p className="mt-2 text-neutral-500">Kami senang menjawab langsung.</p>
        <Link
          href="/contact"
          className="bg-navy mt-6 inline-flex rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Hubungi Kami
        </Link>
      </div>
    </div>
  );
}
