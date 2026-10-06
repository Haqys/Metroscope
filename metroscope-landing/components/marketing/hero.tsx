import Image from 'next/image';
import Link from 'next/link';

import { HeroVideo } from '@/components/marketing/hero-video';
import { Reveal, WordReveal } from '@/components/marketing/scroll-fx';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1920&auto=format&fit=crop&q=70&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTl8fHN0dWRlbnR8ZW58MHx8MHx8fDA%3D';

/**
 * Cinematic hero: the image pins (sticky) for ~half a screen of scroll
 * while the next section slides over it.
 */
export function Hero() {
  return (
    <section className="relative h-[150vh]">
      <div className="bg-maroon-ink sticky top-0 flex h-screen items-end overflow-hidden">
        <Image
          src={HERO_IMAGE}
          alt="Students studying with mentor"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="from-maroon-ink/95 absolute inset-0 bg-gradient-to-t via-black/45 to-black/25"
          aria-hidden
        />

        <div className="relative container pt-40 pb-24 lg:pb-32">
          <Reveal>
            <p className="mb-8 text-xs font-medium tracking-[0.35em] text-white/80 uppercase">
              Elementary · Junior · Senior High Mentoring
            </p>
          </Reveal>

          <h1 className="max-w-5xl font-serif text-[clamp(3.5rem,10vw,8.75rem)] leading-[0.95] font-medium tracking-tight text-white">
            <WordReveal text="Where Champions" startDelay={150} />
            <br />
            <WordReveal text="Are" startDelay={450} className="text-white italic" />{' '}
            <WordReveal text="Forged." startDelay={600} />
          </h1>

          <Reveal delay={900}>
            <div className="mt-10 flex max-w-xl flex-col gap-8 sm:flex-row sm:items-center">
              <p className="text-lg leading-relaxed font-light text-white/80">
                Intensive mentoring for olympiads, debates, and scientific papers: from initial preparation to the podium.
              </p>
            </div>
          </Reveal>

          <Reveal delay={1100}>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link
                href="/register"
                className="text-maroon rounded-full bg-white px-8 py-4 text-sm font-medium tracking-wide transition-transform duration-300 hover:scale-[1.03]"
              >
                Initial Assessment
              </Link>
              <Link
                href="/programs"
                className="rounded-full border border-white/40 px-8 py-4 text-sm font-medium tracking-wide text-white transition-colors duration-300 hover:bg-white/10"
              >
                View Programmes
              </Link>
              <HeroVideo />
            </div>
          </Reveal>
        </div>

        {/* Scroll cue */}
        <div
          className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/60 lg:flex"
          aria-hidden
        >
          <span className="text-[10px] tracking-[0.3em] uppercase">Scroll</span>
          <span className="h-10 w-px animate-pulse bg-white/50" />
        </div>
      </div>
    </section>
  );
}
