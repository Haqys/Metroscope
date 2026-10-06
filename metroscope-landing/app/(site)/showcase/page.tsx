import type { Metadata } from 'next';
import { Reveal } from '@/components/marketing/scroll-fx';
import { absolute, social } from '@/lib/seo';
import { StudentStoryCard } from '@/components/marketing/student-story-card';

const TITLE = 'Students & Alumni';
const DESCRIPTION = 'Inspiring stories from Metroscope students and alumni, their journey of growth, and how they overcome challenges.';
const URL = absolute('/showcase');

const SOCIAL = social({ title: `${TITLE} · Metroscope`, description: DESCRIPTION, url: URL });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { ...SOCIAL.openGraph, type: 'website' },
  twitter: SOCIAL.twitter,
};

const STORIES = [
  {
    slug: 'aura-kirana',
    name: 'Aura Kirana',
    role: 'Team Leader',
    education: 'SMP Cahaya Bangsa',
    program: 'Science Castle Asia (SCA)',
    quote: '"Metroscope performed an extraordinary job by extending this opportunity to me. Hardships undoubtedly existed, but we successfully navigated them collaboratively. And to this day, I have never regretted my decision to walk hand in hand with Metroscope."',
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=60'
  },
  {
    slug: 'bulan-putri-ayu',
    name: 'Bulan Putri Ayu',
    role: 'Youth Role Model & Public Speaker',
    education: '— (Age: 15 years old)',
    program: 'Metro City Junior High School Star Ambassador',
    quote: '"For me, passion is not something that appears instantly. It is discovered through courage, consistency, and the willingness to try new things, a path that Metroscope helped me unlock."',
    imageUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&auto=format&fit=crop&q=60'
  },
  {
    slug: 'oktavianus-alexa-pratama',
    name: 'Oktavianus Alexa Pratama',
    role: 'Student Innovator',
    education: 'SMPN 1 Metro',
    program: 'Science Castle Asia (SCA)',
    quote: '"From the day Metroscope reached out to me, I feel like I\'m as free as a bird. I get to walk along the path I desire, and gain leadership experience."',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=60'
  },
  {
    slug: 'vien-dhia-feyza-as',
    name: 'Vien Dhia Feyza AS',
    role: 'Student Researcher & Role Model',
    education: 'Cahaya Rancamaya Islamic Boarding School',
    program: 'Science Castle Asia & I²ASPO',
    quote: '"Every challenge I embrace alongside Metroscope and my academic pursuits has shaped me into a resilient individual ready to make a lasting impact."',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=60'
  }
];

export default function ShowcasePage() {
  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <Reveal>
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Students & Alumni</p>
        <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
          Inspiring Journeys.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          Discover how our students and alumni embraced challenges, unlocked their potential, and achieved meaningful milestones.
        </p>
      </Reveal>

      <div className="mt-16 grid gap-8 md:grid-cols-2">
        {STORIES.map((story, i) => (
          <Reveal key={story.slug} delay={i * 80}>
            <StudentStoryCard {...story} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
