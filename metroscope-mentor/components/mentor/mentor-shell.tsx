'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  GraduationCap,
  House,
  Trophy,
  LogOut,
  Menu,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';

import { REFRESH_COOKIE } from '@/lib/constants';
import { initialsOf, photoOf, nameOf } from '@/lib/user-display';
import { useSession } from '@/lib/session-context';
import { cn } from '@/lib/utils';

/**
 * Mentor shell.
 *
 * Purpose-built rather than reusing the internal dashboard's sidebar, which is
 * driven by the full page catalogue and role grants. In this app that produced
 * a menu of ~19 entries for 13 routes, most links 404'd, because Finance,
 * Approval Konten and User & Role simply do not exist here.
 *
 * A mentor's day is small and repetitive, so the nav is a fixed list of the
 * seven pages they actually use, in the order they use them. No global search
 * (it was never wired), no workspace switcher (this app is one workspace).
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MY_WORK: NavItem[] = [
  { href: '/me', label: 'Beranda', icon: House },
  { href: '/me/schedule', label: 'Jadwal Saya', icon: CalendarDays },
  { href: '/me/fees', label: 'Fee Saya', icon: Wallet },
];

const TEACHING: NavItem[] = [
  { href: '/students', label: 'Siswa', icon: GraduationCap },
  { href: '/assessments', label: 'Assessment', icon: BadgeCheck },
  { href: '/progress', label: 'Progress', icon: ChartNoAxesCombined },
  { href: '/materials', label: 'Materi', icon: BookOpen },
  /**
   * doc 13 §8.3 lists "record competition result" among the Mentor's five key
   * actions and gives them "/competitions" as a READ. Added in §3.4, together
   * with the page grant the seed had never issued.
   */
  { href: '/competitions', label: 'Lomba', icon: Trophy },
];

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Saya', items: MY_WORK },
  { label: 'Mengajar', items: TEACHING },
];

function Logo() {
  return (
    <Link href="/me" className="flex items-center gap-2.5 px-3" aria-label="Metroscope Mentor">
      <span className="text-navy-dark flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-sm font-bold shadow-sm">
        M
      </span>
      <span className="text-[15px] font-bold tracking-tight text-white">
        Metroscope <span className="font-medium text-white/45">Mentor</span>
      </span>
    </Link>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Exact match for /me so it does not stay active on /me/schedule.
  const active =
    item.href === '/me'
      ? pathname === '/me'
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200',
        active
          ? 'bg-white/10 font-semibold text-white'
          : 'text-white/55 hover:bg-white/5 hover:text-white',
      )}
    >
      {active && (
        <span
          className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-amber-400"
          aria-hidden
        />
      )}
      <item.icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          active ? 'text-amber-400' : 'text-white/40 group-hover:text-white/70',
        )}
      />
      {item.label}
    </Link>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="mt-6 flex flex-col gap-5 overflow-y-auto" aria-label="Menu mentor">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3.5 text-[10px] font-semibold tracking-[0.2em] text-white/30 uppercase">
            {group.label}
          </p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MentorShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();

  const logout = () => {
    // TODO (doc 14 Phase 0.3): POST /v1/auth/logout to revoke the refresh token.
    document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
    router.push('/me');
  };

  return (
    <div className="portal-surface min-h-screen bg-[#f6f7f9]">
      {/* Desktop rail */}
      <aside className="bg-navy-dark fixed inset-y-0 left-0 z-40 hidden w-64 flex-col px-3.5 py-6 lg:flex">
        <Logo />
        <Nav />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="bg-navy-dark absolute inset-y-0 left-0 flex w-72 flex-col px-3.5 py-6">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="mr-1 text-white/50 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Nav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/70 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Buka menu"
              className="shrink-0 text-neutral-700 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <p className="text-sm leading-tight font-semibold text-neutral-900">
                  {nameOf(session)}
                </p>
                <p className="text-xs text-neutral-400">Mentor</p>
              </div>
              <Link
                href="/settings/profile"
                aria-label="Profil saya"
                className="bg-navy flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white transition-transform hover:scale-105"
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

        {/* key re-triggers the entrance cascade on every navigation */}
        <main key={pathname} className="portal-page-up flex-1 px-5 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
