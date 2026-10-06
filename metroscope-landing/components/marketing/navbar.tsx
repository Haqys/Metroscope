'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X, ChevronDown, LayoutTemplate, MapPin } from 'lucide-react';

import { STANDALONE } from '@/lib/standalone';

const NAV_LINKS = [
  { href: '/about', label: 'About Us' },
  { 
    label: 'Programmes & Impacts',
    children: [
      { href: '/programs', label: 'Programmes', icon: LayoutTemplate },
      { href: '/impacts', label: 'Our Impacts', icon: MapPin },
    ]
  },
  { href: '/roadmap', label: 'Roadmap & Services' },
  { href: '/team', label: 'Team' },
  { href: '/showcase', label: 'Students & Alumni' },
  { href: '/articles', label: 'Insights & Articles' },
  { href: '/contact', label: 'FAQ & Contact' },
];

/**
 * Marketing navbar. Transparent over the home hero, then blurs and turns
 * solid on scroll (and on every non-home page). CTA stays fixed.
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
            aria-label="Metroscope, home"
          >
            <span className={solid ? 'text-neutral-900' : 'text-white'}>Metroscope</span>
            <span className="text-maroon">.</span>
          </Link>

          <nav
            className={`hidden items-center gap-9 text-sm font-medium tracking-wide lg:flex ${
              solid ? 'text-neutral-700' : 'text-white/90'
            }`}
          >
            {NAV_LINKS.map((link) => {
              if (link.children) {
                return (
                  <div key={link.label} className="group relative flex h-20 items-center">
                    <button className={`flex items-center gap-1.5 transition-colors ${solid ? 'hover:text-maroon' : 'hover:text-white'}`}>
                      {link.label}
                      <ChevronDown className="h-4 w-4 opacity-70 transition-transform duration-300 group-hover:rotate-180" />
                    </button>
                    
                    <div className="absolute top-[70px] left-1/2 -translate-x-1/2 w-[280px] pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                      <div className="rounded-2xl border border-neutral-100/50 bg-white p-3 shadow-xl shadow-black/5">
                        {link.children.map((child) => (
                          <Link
                            key={child.label}
                            href={child.href}
                            className="group/item flex items-center gap-4 rounded-xl p-3 hover:bg-neutral-50 transition-all"
                          >
                            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white shadow-sm border border-neutral-100 text-maroon group-hover/item:bg-maroon group-hover/item:text-white transition-colors duration-300">
                              <child.icon className="h-5 w-5" />
                            </span>
                            <span className="font-medium text-neutral-800">{child.label}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href!}
                  className={`transition-colors ${solid ? 'hover:text-maroon' : 'hover:text-white'}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-6 lg:flex">
            {!STANDALONE && (
              <Link
                href="/login"
                className={`text-sm font-medium transition-colors ${
                  solid ? 'hover:text-maroon text-neutral-700' : 'text-white/90 hover:text-white'
                }`}
              >
                Sign In
              </Link>
            )}
            <Link
              href="/register"
              className={`rounded-full border px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                solid
                  ? 'border-maroon bg-maroon hover:bg-maroon-dark text-white shadow-md hover:-translate-y-0.5'
                  : 'hover:text-maroon border-white/50 text-white hover:bg-white'
              }`}
            >
              Free Consultation
            </Link>
          </div>

          <button
            type="button"
            className={`lg:hidden ${solid ? 'text-neutral-900' : 'text-white'}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open && (
          <nav className="border-t border-black/5 bg-white/95 backdrop-blur-md lg:hidden">
            <div className="container flex flex-col gap-1 py-5">
              {NAV_LINKS.map((link) => {
                if (link.children) {
                  return (
                    <div key={link.label} className="flex flex-col gap-1">
                      <div className="px-2 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        {link.label}
                      </div>
                      <div className="flex flex-col gap-1 pl-2">
                        {link.children.map((child) => (
                          <Link
                            key={child.label}
                            href={child.href}
                            className="flex items-center gap-3 hover:bg-maroon-light rounded-lg px-2 py-3 text-sm font-medium text-neutral-800"
                            onClick={() => setOpen(false)}
                          >
                            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-maroon/10 text-maroon">
                              <child.icon className="h-4 w-4" />
                            </span>
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={link.href}
                    href={link.href!}
                    className="hover:bg-maroon-light rounded-lg px-2 py-3 text-sm font-medium text-neutral-800"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {!STANDALONE && (
                <Link
                  href="/login"
                  className="hover:bg-maroon-light rounded-lg px-2 py-3 text-sm font-medium text-neutral-800"
                  onClick={() => setOpen(false)}
                >
                  Sign In
                </Link>
              )}
              <Link
                href="/register"
                className="bg-maroon mt-3 rounded-full px-6 py-3.5 text-center text-sm font-medium text-white shadow-md"
                onClick={() => setOpen(false)}
              >
                Free Consultation
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
