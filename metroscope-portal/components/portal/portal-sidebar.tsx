'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartLine,
  CircleQuestionMark,
  Flag,
  LayoutDashboard,
  LogOut,
  Medal,
  Menu,
  ReceiptText,
  Search,
  Settings,
  Trophy,
  X,
} from 'lucide-react';

import { NotificationBell } from './notification-bell';

import { initialsOf, photoOf, nameOf } from '@/lib/user-display';
import { useSession } from '@/lib/session-context';

const NAV_ITEMS = [
  { href: '/portal', label: 'Ringkasan', icon: LayoutDashboard },
  { href: '/portal/schedule', label: 'Jadwal Les', icon: CalendarDays },
  { href: '/portal/progress', label: 'Progress & Porto', icon: ChartLine },
  // One entry: riwayat and katalog are now two sections of one page (doc 13 §6.1).
  { href: '/portal/competitions', label: 'Lomba', icon: Trophy },
  { href: '/portal/materials', label: 'Materi Belajar', icon: BookOpen },
  { href: '/portal/assessments', label: 'Assessment', icon: Flag },
  { href: '/portal/billing', label: 'Tagihan', icon: ReceiptText },
  { href: '/portal/achievements', label: 'Pencapaian & Badge', icon: Medal },
  { href: '/portal/notifications', label: 'Notifikasi', icon: Bell },
  { href: '/portal/help', label: 'Bantuan', icon: CircleQuestionMark },
];

const SETTINGS_ITEM = { href: '/portal/settings', label: 'Pengaturan', icon: Settings };

function greetingFor(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3" aria-label="Metroscope, beranda">
      <span className="from-navy to-navy-dark shadow-navy/20 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold text-white shadow-sm">
        M
      </span>
      <span className="text-lg font-bold tracking-tight text-neutral-900">
        Metroscope<span className="text-maroon">.</span>
      </span>
    </Link>
  );
}

function NavItem({
  item,
  onNavigate,
}: {
  item: { href: string; label: string; icon: typeof LayoutDashboard };
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Exact match, or a nested path under item.href, the trailing-slash
  // boundary keeps `/portal/competition` and `/portal/competitions` distinct.
  const active =
    item.href === '/portal'
      ? pathname === '/portal'
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 ${
        active
          ? 'bg-navy-light text-navy font-semibold'
          : 'text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-900'
      }`}
    >
      {active && (
        <span
          className="bg-navy absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full"
          aria-hidden
        />
      )}
      <item.icon
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
          active ? 'text-navy' : 'text-neutral-400 group-hover:text-neutral-600'
        }`}
      />
      {item.label}
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <p className="mt-7 mb-2 px-3.5 text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">
        Portal Siswa
      </p>
      <nav className="flex flex-col gap-1" aria-label="Portal siswa">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto border-t border-neutral-200 pt-3">
        <NavItem item={SETTINGS_ITEM} onNavigate={onNavigate} />
      </div>
    </>
  );
}

/**
 * Portal shell: clean light sidebar (desktop rail / mobile drawer) + white
 * topbar. `portal-surface` scopes the sans-only typography override.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const session = useSession();

  // Time-based greeting, set after mount to avoid hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const greeting = now ? greetingFor(now.getHours()) : 'Halo';
  const dateLabel = now
    ? now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  // Ctrl/⌘ + K focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Sign out for real.
   *
   * The session cookie is HttpOnly and scoped to COOKIE_DOMAIN, so JavaScript
   * here cannot clear it, which is the point. Only the server that set it can,
   * and going through the landing app's endpoint also revokes the token with
   * GoTrue rather than merely forgetting it in this browser.
   */
  const logout = async () => {
    const landing = process.env.NEXT_PUBLIC_LANDING_URL ?? 'http://localhost:3004';
    try {
      await fetch(`${landing}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = `${landing}/login`;
    }
  };

  return (
    <div className="portal-surface min-h-screen bg-[#f6f7f9]">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-neutral-200/70 bg-white/85 px-3.5 py-6 backdrop-blur-xl lg:flex">
        <Logo />
        <NavLinks />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white px-3 py-6">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="mr-1 text-neutral-400 hover:text-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/70 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Buka menu"
                className="shrink-0 text-neutral-700 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              {/* Greeting + date */}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {greeting}, {nameOf(session)}
                </p>
                <p className="truncate text-xs text-neutral-400">{dateLabel}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              {/* Search with ⌘K shortcut */}
              <div className="relative hidden items-center md:flex">
                <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-neutral-400" />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Cari..."
                  aria-label="Cari di portal"
                  className="focus:border-navy focus:ring-navy/15 w-52 rounded-full border border-neutral-200 bg-neutral-50 py-2 pr-14 pl-10 text-sm text-neutral-800 transition-all placeholder:text-neutral-400 focus:w-64 focus:bg-white focus:ring-2 focus:outline-none"
                />
                <kbd className="pointer-events-none absolute right-3 rounded-md border border-neutral-200/70 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
                  Ctrl K
                </kbd>
              </div>

              <NotificationBell />

              <Link
                href="/portal/settings"
                aria-label="Buka pengaturan profil"
                className="bg-navy ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white transition-transform hover:scale-105"
              >
                {/* The uploaded photo when there is one; initials are the fallback,
                    not the design. eslint-disable: a Supabase Storage URL is not a
                    configured next/image domain. */}
                {photoOf(session) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoOf(session)!} alt="" className="h-full w-full object-cover" />
                ) : (
                  initialsOf(session)
                )}
              </Link>

              <button
                type="button"
                onClick={logout}
                aria-label="Keluar dari akun"
                title="Keluar"
                className="hover:text-maroon flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </header>

        {/* key re-triggers the slide-up animation on every navigation */}
        <main key={pathname} className="portal-page-up flex-1 px-5 py-8 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-neutral-200 px-5 py-6 text-center text-xs text-neutral-400 lg:px-8">
          © {new Date().getFullYear()} Metroscope · Bimbingan olimpiade &amp; kompetisi
        </footer>
      </div>
    </div>
  );
}
