import type { Metadata } from 'next';
import Link from 'next/link';

import { CompetitionCard } from '@/components/marketing/competition-card';
import { Reveal } from '@/components/marketing/scroll-fx';
import { EmptyState } from '@/components/ui/states';
import { listCompetitions } from '@/lib/competitions-api';
import { absolute, breadcrumbList, social } from '@/lib/seo';
import { JsonLd } from '@/components/marketing/json-ld';

const DESCRIPTION =
  'Kalender lomba dan olimpiade untuk siswa SD, SMP, dan SMA, deadline pendaftaran, biaya, dan panduan resmi, diperbarui tim Metroscope.';
const URL = absolute('/competitions');
const SOCIAL = social({ title: 'Info Lomba · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Info Lomba',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * `/competitions`, deferred from §2.7 for want of a table, built in §3.4.
 *
 * doc 13 §5.1 lists this as the one missing public page worth the most:
 * "the single best organic lead magnet Metroscope owns". A parent searching
 * *"lomba sains SMP 2026"* lands on a calendar the business maintains anyway,
 * which is the cheapest honest reason to visit.
 *
 * These are the SAME rows staff edit at `/competitions` and families read in
 * the portal. doc 13 §P7 recorded what the alternative cost: "adding a lomba in
 * the admin changes nothing for students".
 */
export default async function CompetitionsPage() {
  const competitions = await listCompetitions({ limit: 100 });

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <JsonLd
        docs={[
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: 'Info Lomba', path: '/competitions' },
          ]),
        ]}
      />

      <Reveal>
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Info Lomba</p>
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
          Lomba yang Sedang Dibuka.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          Deadline, biaya, dan panduan resmi, dikumpulkan tim kami supaya orang tua tidak perlu
          menelusuri sepuluh akun Instagram penyelenggara.
        </p>
      </Reveal>

      {competitions.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            title="Belum ada lomba yang dibuka"
            description="Kalender diperbarui setiap kali pendaftaran baru dibuka. Hubungi kami untuk dikabari lebih dulu."
          />
        </div>
      ) : (
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((competition, i) => (
            <Reveal key={competition.id} delay={i * 60}>
              <CompetitionCard competition={competition} />
            </Reveal>
          ))}
        </div>
      )}

      <Reveal>
        <div className="border-maroon/15 bg-maroon-light/40 mt-20 rounded-2xl border p-8 sm:p-10">
          <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
            Bingung memilih lomba yang tepat?
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed font-light text-neutral-600">
            Mentor kami memetakan minat dan kesiapan anak dulu, baru memilih lomba, bukan
            sebaliknya.
          </p>
          <Link
            href="/register"
            className="bg-maroon mt-6 inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Konsultasi Gratis
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
