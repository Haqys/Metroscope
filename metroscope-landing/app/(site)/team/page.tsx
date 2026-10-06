import type { Metadata } from 'next';

import { MentorCard } from '@/components/marketing/mentor-card';
import { TeamCard } from '@/components/marketing/team-card';
import { EmptyState } from '@/components/ui/states';
import { Reveal } from '@/components/marketing/scroll-fx';
import { listMentors } from '@/lib/surfaces-api';
import { absolute, social } from '@/lib/seo';

const DESCRIPTION = 'Get to know the core team and specialist mentors at Metroscope who will guide your child.';
const URL = absolute('/team');
const SOCIAL = social({ title: 'Our Team · Metroscope', description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: 'Our Team',
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

const CORE_TEAM = [
  {
    name: "Balqis Pita Kusuma Wahyudi",
    role: "Chief Executive Officer",
    bio: "An independent and visionary strategist distinguished by rigorous analytical capabilities, a strong dedication to empirical research, and a profound commitment to educational advancement.",
    linkedin: "#",
    github: "#"
  },
  {
    name: "Aguini Providensia Tjandra",
    role: "Chief Operating Officer",
    bio: "An adept leader specializing in operational optimization, systematic management frameworks, and the seamless execution of institutional workflows.",
    linkedin: "https://www.linkedin.com/in/aguini-providensia-tjandra-109826342",
    github: "#"
  },
  {
    name: "I Made Aravinda Kumara",
    role: "Chief Marketing Officer",
    bio: "A digital business strategist combining creative design methodologies, strategic brand communication, and visual innovation to drive audience engagement.",
    linkedin: "https://www.linkedin.com/in/i-made-aravinda-kumara?utm_source=share_via&utm_content=profile&utm_medium=member_ios",
    github: "#"
  },
  {
    name: "Marshelinda Rukmana",
    role: "Chief Financial Officer",
    bio: "A meticulous and disciplined professional demonstrating advanced proficiency in financial administration, rigorous documentation management, and fiscal governance.",
    linkedin: "https://www.linkedin.com/in/marshelinda-rukmana?utm_source=share_via&utm_content=profile&utm_medium=member_android",
    github: "#"
  },
  {
    name: "I Made Saskara Bawa",
    role: "Chief Technology Officer",
    bio: "An informatics scholar integrating cutting-edge artificial intelligence, robust technological infrastructure, and systematic innovation to engineer advanced digital solutions.",
    linkedin: "https://www.linkedin.com/in/i-made-saskara-bawa-31a497378/",
    github: "#"
  }
];

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
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Team</p>
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
          The People Behind the Scenes.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          Metroscope&apos;s dedicated core team and specialist mentors. Your child learns from people who have been on the same stage.
        </p>
      </Reveal>

      <div className="mt-16">
        <h2 className="mb-10 font-serif text-3xl font-medium text-neutral-900">Core Team</h2>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-6">
          {CORE_TEAM.map((member, i) => (
            <Reveal 
              key={member.name} 
              delay={i * 80}
              className={`h-full sm:col-span-1 xl:col-span-2 ${i === 3 ? 'xl:col-start-2' : ''} ${i === 4 ? 'sm:col-span-2 sm:max-w-[calc(50%-0.75rem)] sm:mx-auto xl:col-span-2 xl:max-w-none xl:mx-0' : ''}`}
            >
              <TeamCard member={member} />
            </Reveal>
          ))}
        </div>
      </div>

      <div className="mt-24">
        <h2 className="mb-10 font-serif text-3xl font-medium text-neutral-900">Specialist Mentors</h2>
        {mentors.length === 0 ? (
          <EmptyState
            title="Mentor profiles are not available yet"
            description="The team is preparing the profiles. Contact us to get acquainted first."
          />
        ) : (
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {mentors.map((mentor, i) => (
              <Reveal key={mentor.id} delay={i * 80}>
                <MentorCard mentor={mentor} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
