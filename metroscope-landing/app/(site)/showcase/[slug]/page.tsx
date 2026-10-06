import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, Award } from 'lucide-react';
import { Reveal } from '@/components/marketing/scroll-fx';
import { absolute } from '@/lib/seo';

const STORIES = [
  {
    slug: 'aura-kirana',
    name: 'Aura Kirana',
    role: 'Team Leader',
    education: 'SMP Cahaya Bangsa',
    program: 'Science Castle Asia (SCA)',
    quote: '"I once thought my dreams would remain merely a dream and gradually fade away."',
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=60',
    content: `Long before I became acquainted with Metroscope, I harbored a singular, profound ambition: to become a scientist. I had a deep passion for exploring novel concepts, conducting various experiments, and driving innovation. However, due to intervening circumstances, I watched that enthusiasm slowly dissipate. I even suspected that my aspirations were nothing more than childhood idealisms destined never to materialize.

I never anticipated that the small spark within me would ever be reignited. One day, the Metroscope team reached out and invited me to spearhead a group for Science Castle Asia. For someone who had nearly relinquished her dreams, this served as a monumental stepping stone. A wave of doubt briefly arose: was I being reckless in accepting this offer?

Pursuing new knowledge and innovating has always been my core ambition. But leading others? Candidly, I harbored severe doubts regarding my own capabilities. Yet, without hesitation, I chose to embrace that risk. "I would not lie in saying that leadership is easy, particularly for a novice like myself. Nevertheless, I am deeply grateful that Metroscope and the team guided me every step of the way."

Throughout my journey in Science Castle Asia, I cultivated an array of new competencies. From unifying team chemistry and procuring appropriate instrumentation for research, to helping resolve personal challenges within my cohort, I finally came to understand that being a leader is far more meaningful than simply directing others.`
  },
  {
    slug: 'bulan-putri-ayu',
    name: 'Bulan Putri Ayu',
    role: 'Youth Role Model & Public Speaker',
    education: '— (Age: 15 years old)',
    program: 'Metro City Junior High School Star Ambassador',
    quote: '"Every experience I take becomes part of my journey to grow into a confident, impactful, and inspiring young individual."',
    imageUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&auto=format&fit=crop&q=60',
    content: `My name is Bulan Putri Ayu, and I am 15 years old. I am a student who found my true calling in education, public speaking, and the creative industry. From an early age, I discovered my confidence in speaking and performing in front of audiences. What initially began as a modest interest gradually evolved into a meaningful journey of discovering my lifelong passions.

Throughout my personal growth, I have actively explored diverse disciplines, including being a Master of Ceremony (MC), modeling, music, and acting. Musically, I play several instruments, such as the violin and guitar, continually refining my artistic capabilities through various performances and competitions.

In 2024, I was deeply honored to be selected as Bintang Sobat SMP Kota Metro, a pivotal milestone that strengthened my leadership, sense of responsibility, and confidence as a young role model. Another significant milestone in my career was serving as a host for national educational events organized by KEMENDIKDASMEN (Ministry of Primary and Secondary Education), which substantially elevated my expertise in public speaking.

My journey in public speaking has culminated in multiple accolades in speech and public speaking competitions, further motivating me to continually hone my communication skills. In the realm of acting, I have contributed to film projects such as "1000 Detik Satu Cahaya" and "Keira." Through these immersive experiences, I learned invaluable lessons regarding teamwork, emotional expression, and professional conduct on set.

Parallel to these pursuits, I have actively engaged in modeling and runway performances, including appearances on international-level stages. These experiences have profoundly contributed to building my self-assurance, discipline, and a global perspective.`
  },
  {
    slug: 'oktavianus-alexa-pratama',
    name: 'Oktavianus Alexa Pratama',
    role: 'Student Innovator',
    education: 'SMPN 1 Metro',
    program: 'Science Castle Asia (SCA)',
    quote: '"I know for a fact that the past me is looking at my present self with joy."',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=60',
    content: `My name is Oktavianus Alexa Pratama, a passionate student from Lampung currently attending SMPN 1 Kota Metro. "Initially, I was just a student who viewed school merely as an obligation and routine, without really knowing where to direct my dreams." However, beneath that surface, I harbored a profound interest in various environmental issues occurring around me. I had witnessed firsthand how environmental degradation impacts myself, others, and all living beings.

My curiosity truly began to take shape when I was entrusted with the role of Environmental Management Ambassador at my school. From that point onward, I believed my role as a student should signify far more than simply being present in a classroom; I wanted to transform pressing environmental challenges into tangible innovations. Nevertheless, I was acutely aware of my limitations as a student at the time.

I realized I lacked sufficient opportunities to delve deeply into environmental science and technology. "It was at this critical juncture that I became acquainted with Metroscope, which ultimately broadened my perspective and paved the way forward." Recognizing my intrinsic passion, Metroscope invited me to lead their representatives for Science Castle Asia (SCA).

Throughout this journey, I identified a lack of empowerment regarding the cultivation of a native plant from the Jatiagung area in Lampung—namely, sacha inchi. Driven by this observation, I initiated the development of this local plant into a supplement designated as "Sachi," aimed at supporting cognitive nutrition intake for students, particularly at SMPN 1 Kota Metro, while simultaneously generating added value for local farmers.

Furthermore, my attention was drawn to the abundance of agricultural waste, particularly corn husks, which highlighted deficiencies in the agricultural sector's waste management systems. Through a case study involving approximately 10 hectares of land in Menggala, Lampung Province, local farmers noted that such waste is frequently discarded into rivers or incinerated, thereby exacerbating environmental concerns.`
  },
  {
    slug: 'vien-dhia-feyza-as',
    name: 'Vien Dhia Feyza AS',
    role: 'Student Researcher & Role Model',
    education: 'Cahaya Rancamaya Islamic Boarding School',
    program: 'Science Castle Asia & I²ASPO',
    quote: '"Overall, I see myself as a lifelong learner, someone who embraces challenges, values growth, and believes that passion, when nurtured with consistency and courage, can lead to meaningful achievements."',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=60',
    content: `My name is Vien Dhia Feyza AS, and I am a Grade 9 student at Cahaya Bangsa Junior High School, born on May 2, 2011. In my earlier years, I tended to be quite shy and somewhat pessimistic, particularly regarding the pursuit of my dreams. I used to confine my aspirations within safe and easily reachable limits simply because I was afraid of failing or aiming too high. However, as I matured, I came to realize that personal growth only occurs when we dare to step beyond our comfort zones and conquer our fears. Today, I genuinely relish learning novel concepts, exploring unfamiliar disciplines, and engaging in diverse activities that continually challenge me.

Throughout this transformative journey, I learned that dreaming serves as the fundamental catalyst for progress. Many achievements admired today were once deemed unrealistic or impossible. Yet, I discovered that by believing in our capabilities and consistently nurturing our passions, growth becomes a natural outcome. Gradually, I learned how to ignite my inner drive and transform it into a sustaining motivation for continuous self-improvement.

I have actively participated in numerous competitions spanning city, provincial, national, and international tiers across a wide array of fields. All of these endeavors stem from a genuine enthusiasm for experimentation and discovering my true strengths. Some of my notable achievements include securing 1st and 3rd place in provincial and national short video competitions, earning diverse medals in English Olympiads, winning modern dance championships, and performing in creative cultural fields such as Kelakar.

In the realm of science and research, my team and I were honored to receive a Gold Medal at the Indonesia International Applied Science Project Olympiad (I²ASPO) and a Silver Medal at Science Castle Asia (SCA) for our project titled "Neutral Buffered Potassium Iodide and Na₂S₂O₃ as Absorbers of Harmful Tropospheric Ozone Using Ozonometric, an IoT-Based Integrated Spectrophotometric Impinger." These rigorous experiences significantly strengthened my critical thinking, collaborative abilities, and scientific research competencies.

In 2025, I was selected as Bintang Sobat SMP Kota Metro, Generation 2, serving as a student role model with the mission to motivate junior high school peers toward strong character development and dual academic-extracurricular excellence. Furthermore, I had the privilege of serving as a delegate at the Asia World Model United Nations (AWMUN) XII, representing Thailand in the WHO Junior Council—an experience that profoundly expanded my global awareness, diplomatic acumen, and public speaking self-assurance.

Beyond academics and competitive arenas, I actively pursue various extracurricular engagements, including playing the piano and guitar, singing, public speaking, video editing, basketball, modern and traditional dance, and novel writing. Writing remains one of my core creative passions alongside these expressive outlets.`
  }
];

export function generateStaticParams() {
  return STORIES.map((story) => ({
    slug: story.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = STORIES.find((s) => s.slug === slug);
  if (!story) return {};

  const title = `${story.name} · Metroscope Students & Alumni`;
  const url = absolute(`/showcase/${story.slug}`);

  return {
    title,
    description: story.quote,
    alternates: { canonical: url },
  };
}

export default async function StudentStoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = STORIES.find((s) => s.slug === slug);

  if (!story) {
    notFound();
  }

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <Reveal>
        <Link 
          href="/showcase"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-maroon transition-colors mb-12"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Students & Alumni
        </Link>
      </Reveal>

      <div className="grid gap-16 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Reveal delay={100} className="sticky top-32">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-sm">
                <Image src={story.imageUrl} alt={`Foto ${story.name}`} fill sizes="80px" className="object-cover" />
              </div>
              <div>
                <h1 className="font-serif text-3xl font-semibold text-neutral-900">{story.name}</h1>
                <p className="text-maroon font-medium mt-1">{story.role}</p>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-neutral-100">
              <div className="flex items-center gap-3 text-neutral-600">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-50">
                  <GraduationCap className="h-5 w-5 text-neutral-400" />
                </div>
                <span className="text-sm font-medium">{story.education}</span>
              </div>
              <div className="flex items-center gap-3 text-neutral-600">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-50">
                  <Award className="h-5 w-5 text-neutral-400" />
                </div>
                <span className="text-sm font-medium leading-tight">{story.program}</span>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-8">
          <Reveal delay={200}>
            <blockquote className="border-l-4 border-maroon pl-6 text-2xl leading-relaxed font-serif italic text-neutral-800 mb-10">
              {story.quote}
            </blockquote>

            <div className="space-y-6 text-neutral-600 font-light leading-relaxed text-lg">
              {story.content.split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
