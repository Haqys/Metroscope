'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

import { STANDALONE } from '@/lib/standalone';

const NAV_LINKS = [
  { href: '/programs', label: 'Program' },
  { href: '/competitions', label: 'Info Lomba' },
  { href: '/articles', label: 'Artikel' },
  { href: '/#testimoni', label: 'Testimoni' },
  { href: '/mentors', label: 'Mentor' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'Tentang Kami' },
];

/**
 * Marketing navbar. Transparent over the home hero, then blurs and turns
 * solid on scroll (and on every non-home page). CTA stays fixed, the
 * decided sticky-CTA behavior (README open item 3).
 */
export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const solid = scrolled || !isHome || open;

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          solid
            ? 'border-b border-black/5 bg-white/85 shadow-sm backdrop-blur-md'
            : 'bg-transparent'
        }`}
      >
        <div className="container flex h-20 items-center justify-between gap-6">
          <Link
            href="/"
            className="flex items-baseline gap-1 font-serif text-[1.75rem] font-semibold tracking-tight"
            aria-label="Metroscope, beranda"
          >
            <span className={solid ? 'text-neutral-900' : 'text-white'}>Metroscope</span>
            <span className="text-maroon">.</span>
          </Link>

          <nav
            className={`hidden items-center gap-9 text-sm font-medium tracking-wide lg:flex ${
              solid ? 'text-neutral-700' : 'text-white/90'
            }`}
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors ${solid ? 'hover:text-maroon' : 'hover:text-white'}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-6 lg:flex">
            {/*
              Hidden until the portal is deployed. A "Masuk" that authenticates
              somebody and then lands them on nothing is worse than no link:
              the sign-in succeeds, so the visitor concludes the fault is
              theirs. `/login` itself 404s in standalone for the same reason.
            */}
            {!STANDALONE && (
              <Link
                href="/login"
                className={`text-sm font-medium transition-colors ${
                  solid ? 'hover:text-maroon text-neutral-700' : 'text-white/90 hover:text-white'
                }`}
              >
                Masuk
              </Link>
            )}
            <Link
              href="/register"
              className={`rounded-full border px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                solid
                  ? 'border-maroon bg-maroon hover:bg-maroon-dark text-white'
                  : 'hover:text-maroon border-white/50 text-white hover:bg-white'
              }`}
            >
              Konsultasi Gratis
            </Link>
          </div>

          <button
            type="button"
            className={`lg:hidden ${solid ? 'text-neutral-900' : 'text-white'}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open && (
          <nav className="border-t border-black/5 bg-white/95 backdrop-blur-md lg:hidden">
            <div className="container flex flex-col gap-1 py-5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:bg-maroon-light rounded-lg px-2 py-3 text-sm font-medium text-neutral-800"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              {!STANDALONE && (
                <Link
                  href="/login"
                  className="hover:bg-maroon-light rounded-lg px-2 py-3 text-sm font-medium text-neutral-800"
                  onClick={() => setOpen(false)}
                >
                  Masuk
                </Link>
              )}
              <Link
                href="/register"
                className="bg-maroon mt-3 rounded-full px-6 py-3.5 text-center text-sm font-medium text-white"
                onClick={() => setOpen(false)}
              >
                Konsultasi Gratis
              </Link>
            </div>
          </nav>
        )}
      </header>

      {/* Fixed header needs an in-flow spacer everywhere except the home hero */}
      {!isHome && <div className="h-20" aria-hidden />}
    </>
  );
}
