import type { Metadata } from 'next';

import { MentorCard } from '@/components/marketing/mentor-card';
import { EmptyState } from '@/components/ui/states';
import { Reveal } from '@/components/marketing/scroll-fx';
import { listMentors } from '@/lib/surfaces-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION = 'Mentor spesialis Metroscope, siapa yang akan mendampingi anak Anda.';
const URL = absolute('/mentors');
const SOCIAL = social({ title: 'Mentor · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Mentor',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

/**
 * `/mentors`, doc 13 §16: "Missing, doc 11 §11 promised mentor profiles;
 * parents buy the mentor".
 *
 * Reads `mentor_profiles`, a table that exists precisely so this page never
 * touches `users`. Nothing here can leak a staff email because no query on this
 * path can see one.
 */
export default async function MentorsPage() {
  const mentors = await listMentors();

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <Reveal>
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Tim</p>
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
          Mentor yang Mendampingi.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          Spesialis di bidangnya, bukan pengajar serba bisa. Anak Anda belajar dari orang yang
          pernah berada di panggung yang sama.
        </p>
      </Reveal>

      {mentors.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            title="Profil mentor belum tersedia"
            description="Tim sedang menyiapkan profil. Hubungi kami untuk berkenalan lebih dulu."
          />
        </div>
      ) : (
        <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {mentors.map((mentor, i) => (
            <Reveal key={mentor.id} delay={i * 80}>
              <MentorCard mentor={mentor} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
