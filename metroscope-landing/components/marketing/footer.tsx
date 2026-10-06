import Link from 'next/link';

import { CONTACT, STANDALONE } from '@/lib/standalone';

/** `Portal Siswa` is dropped in standalone, like the navbar's `Sign In`. */
const FOOTER_LINKS = [
  { href: '/about', label: 'About Us' },
  { href: '/programs', label: 'Programmes & Impacts' },
  { href: '/roadmap', label: 'Roadmap & Services' },
  { href: '/team', label: 'Team' },
  { href: '/showcase', label: 'Students & Alumni' },
  { href: '/contact', label: 'FAQ & Contact' },
  { href: '/register', label: 'Free Consultation' },
  ...(STANDALONE ? [] : [{ href: '/login', label: 'Student Portal' }]),
];

/**
 * Only channels that exist.
 *
 * This list was `https://instagram.com`, the site's own front page rather than
 * any Metroscope account, and `mailto:halo@metroscope.id`, whose domain is not
 * registered. Both looked like contact details and neither reached anybody. A
 * footer with one working link is worth more than one with two dead ones, and
 * an empty list renders no section at all.
 */
const SOCIALS = [
  CONTACT.instagram ? { href: CONTACT.instagram, label: 'Instagram' } : null,
  CONTACT.email ? { href: `mailto:${CONTACT.email}`, label: 'Email' } : null,
].filter((s): s is { href: string; label: string } => s !== null);

/** Minimal editorial footer with an oversized wordmark. */
export function Footer() {
  return (
    <footer className="bg-maroon-ink text-white">
      <div className="container pt-20 pb-10">
        <p className="font-serif text-[clamp(3.5rem,12vw,11rem)] leading-none font-medium tracking-tight text-white/95 select-none">
          Metroscope<span className="text-white/40">.</span>
        </p>

        <div className="mt-16 flex flex-col gap-10 border-t border-white/10 pt-10 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-sm text-sm leading-relaxed font-light text-white/60">
            Competition mentoring for elementary to high school students, olympiads, debates, and scientific papers. From the first preparation to the podium.
          </p>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
            {FOOTER_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-white/80 transition-colors hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <nav
            aria-label="Social media"
            className="flex gap-x-10 text-sm"
            hidden={SOCIALS.length === 0}
          >
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="text-white/50 transition-colors hover:text-white"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-2 text-xs text-white/40 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Metroscope. Olympiad &amp; competition mentoring.</p>
          <p>Consultation confirmation via email within 24 hours.</p>
        </div>
      </div>
    </footer>
  );
}
