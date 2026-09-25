'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';

import { REFRESH_COOKIE } from '@/lib/constants';
import { PAGE_GROUPS, pagesInGroup } from '@/lib/pages';
import { initialsOf, photoOf, nameOf, roleLabel } from '@/lib/user-display';
import { useSession } from '@/lib/session-context';
import { cn } from '@/lib/utils';

import { WorkspaceSwitcher } from '@/components/internal/workspace-switcher';

/**
 * Nav is the page catalogue (`lib/pages.ts`) filtered by the account's granted
 * pages, as the API returned them, not by a local role table.
 *
 * This used to derive the menu from `lib/roles-data.ts` by role code, which had
 * two consequences: a page granted in the seed stayed invisible until somebody
 * edited that fixture too, and a CUSTOM role invented by the Head, the entire
 * point of roles being data (doc 12 §1), got no menu at all, because the
 * fixture had never heard of it.
 *
 * `session.pages` comes from `GET /v1/auth/me`, resolved per request from
 * `role_pages`. It is the same source RLS reads, so the nav and the data now
 * agree by construction.
 */
function navGroupsFor(grantedPages: string[]) {
  const granted = new Set(grantedPages);
  return PAGE_GROUPS.map((group) => ({
    label: group,
    items: pagesInGroup(group).filter((p) => p.inNav && granted.has(p.href)),
  })).filter((g) => g.items.length > 0);
}

/**
 * How much work is waiting, for the `/inbox` badge (doc 14 §1.3).
 *
 * Refetched when the route changes rather than on a timer. Acting on an inbox
 * item always ends in a navigation, so that is exactly when the number moves,
 * and a badge that polls all day to tell four people the same unchanged figure
 * is a cost with no reader.
 *
 * A failure is silent on purpose. The nav must render whether or not this
 * answers; no badge is a fine outcome, a broken sidebar is not.
 */
function useInboxCount(enabled: boolean) {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    fetch('/api/bff/inbox/counts')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancelled && typeof b?.data?.total === 'number') setCount(b.data.total);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled, pathname]);

  return count;
}

function Logo() {
  return (
    <Link
      href="/overview"
      className="flex items-center gap-2.5 px-3"
      aria-label="Metroscope Internal"
    >
      <span className="text-navy-dark flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-sm font-bold shadow-sm">
        M
      </span>
      <span className="text-[15px] font-bold tracking-tight text-white">
        Metroscope <span className="font-medium text-white/45">Internal</span>
      </span>
    </Link>
  );
}

function NavItem({
  item,
  onNavigate,
  badge,
}: {
  item: { href: string; label: string; icon: LucideIcon };
  onNavigate?: () => void;
  badge?: number | null;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      {!!badge && (
        <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-neutral-900">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pages } = useSession();
  const groups = navGroupsFor(pages);
  const inboxCount = useInboxCount(pages.includes('/inbox'));

  return (
    <nav className="mt-6 flex flex-col gap-5 overflow-y-auto" aria-label="Dashboard internal">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3.5 text-[10px] font-semibold tracking-[0.2em] text-white/30 uppercase">
            {group.label}
          </p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                onNavigate={onNavigate}
                badge={item.href === '/inbox' ? inboxCount : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Internal dashboard shell: dark navy rail (desktop) / drawer (mobile) +
 * light topbar with global search and the signed-in identity.
 */
export function InternalShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const session = useSession();

  /**
   * Login lives on the landing site. One door for every role (doc 03 FR-AC-3),
   * and this app has no /login route of its own.
   */
  const logout = () => {
    // TODO (doc 14 Phase 0.3): POST /v1/auth/logout to revoke the refresh token.
    document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
    window.location.href = process.env.NEXT_PUBLIC_LOGIN_URL ?? 'http://localhost:3004/login';
  };

  return (
    <div className="portal-surface min-h-screen bg-[#f6f7f9]">
      {/* Desktop rail */}
      <aside className="bg-navy-dark fixed inset-y-0 left-0 z-40 hidden w-64 flex-col px-3.5 py-6 lg:flex">
        <Logo />
        <NavLinks />
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
            <NavLinks onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/70 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Buka menu"
                className="shrink-0 text-neutral-700 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              {/*
                Global search removed. It was an <input> with no handler, no
                submit and no results view, advertising a capability that did
                not exist. It returns as a real ⌘K command palette backed by
                `GET /v1/search` (doc 14 Phase 4).
              */}
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              {/* Only rendered when the account holds more than one role */}
              <WorkspaceSwitcher />

              <div className="hidden text-right sm:block">
                <p className="text-sm leading-tight font-semibold text-neutral-900">
                  {nameOf(session)}
                </p>
                <p className="text-xs text-neutral-400">{roleLabel(session.primaryRole)}</p>
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
