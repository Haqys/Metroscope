'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ExternalLink,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';

import { REFRESH_COOKIE } from '@/lib/constants';
import { useSession } from '@/lib/session-context';
import { cn } from '@/lib/utils';

interface NavItemDef {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

const CMS_NAV_ITEMS: NavItemDef[] = [
  {
    href: '/home',
    label: 'Beranda CMS',
    description: 'Ringkasan & status konten situs',
    icon: LayoutDashboard,
  },
  {
    href: '/site/impacts',
    label: 'Dampak & Prestasi',
    description: 'Cerita delegasi & medali siswa',
    icon: Sparkles,
    badge: 'Prioritas',
  },
  {
    href: '/site/articles',
    label: 'Artikel & Wawasan',
    description: 'Panduan, tips & berita riset',
    icon: Newspaper,
  },
  {
    href: '/site/programs',
    label: 'Program Edukasi',
    description: 'Tingkatan & detail paket les',
    icon: GraduationCap,
  },
  {
    href: '/site',
    label: 'Pusat Konten',
    description: 'Semua draf & antrean terbit',
    icon: Globe,
  },
];

function Logo() {
  return (
    <Link href="/home" className="flex items-center gap-2 px-3 py-2" aria-label="Metroscope CMS Studio">
      <span className="font-sans text-xl font-bold tracking-tight text-neutral-900">
        Metroscope<span className="text-maroon">.</span>
      </span>
      <span className="rounded-full border border-maroon/20 bg-maroon-light px-2.5 py-0.5 text-[11px] font-bold text-maroon">
        CMS Studio
      </span>
    </Link>
  );
}

function NavItem({
  item,
  onNavigate,
}: {
  item: NavItemDef;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200',
        active
          ? 'bg-maroon-light font-semibold text-maroon shadow-xs'
          : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900',
      )}
    >
      <div className="flex items-center gap-3">
        <item.icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-colors',
            active ? 'text-maroon' : 'text-neutral-400 group-hover:text-neutral-700',
          )}
        />
        <span>{item.label}</span>
      </div>

      {item.badge && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold',
            active
              ? 'bg-maroon text-white'
              : 'bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200',
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-between">
      <nav className="mt-6 flex flex-col gap-1" aria-label="Menu Kelola Konten">
        <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
          Kelola Konten Web Klien
        </p>
        {CMS_NAV_ITEMS.map((item) => (
          <NavItem key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Footer shortcut to client site */}
      <div className="mt-auto border-t border-neutral-100 pt-4">
        <a
          href="https://metroscope.id"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-3 text-xs font-semibold text-neutral-700 transition-colors hover:border-maroon/30 hover:bg-white"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-maroon" />
            <span>Situs Utama (metroscope.id)</span>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
        </a>
      </div>
    </div>
  );
}

/**
 * Clean, editor-focused CMS Shell matching the client site aesthetic.
 */
export function InternalShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const session = useSession();

  const logout = () => {
    document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
    const target = process.env.NEXT_PUBLIC_LOGIN_URL;
    if (target && !target.includes('localhost') && !target.includes('127.0.0.1')) {
      window.location.href = target;
    } else {
      window.location.href = '/home';
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      {/* Desktop rail (matching client site branding) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-neutral-200/80 bg-white px-4 py-6 shadow-xs lg:flex">
        <Logo />
        <NavLinks />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-neutral-200/80 bg-white px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
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
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/80 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Buka menu"
                className="rounded-lg p-1.5 text-neutral-700 hover:bg-neutral-100 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-2 text-xs text-neutral-500 sm:flex">
                <span className="font-semibold text-neutral-900">Metroscope CMS</span>
                <span>/</span>
                <span>Konten Website Klien</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <a
                href="https://metroscope.id"
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 sm:inline-flex"
              >
                <span>Pratinjau Web Klien</span>
                <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
              </a>

              <div className="flex items-center gap-2 rounded-full border border-neutral-200/70 bg-white py-1 pl-3 pr-1.5 shadow-2xs">
                <span className="text-xs font-semibold text-neutral-800">
                  {session.displayName || 'Tim Metroscope'}
                </span>
                <span className="rounded-full bg-maroon-light px-2 py-0.5 text-[10px] font-bold text-maroon">
                  Editor
                </span>
              </div>

              <button
                type="button"
                onClick={logout}
                aria-label="Keluar dari akun"
                title="Keluar"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-maroon"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Content canvas */}
        <main key={pathname} className="flex-1 px-5 py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
