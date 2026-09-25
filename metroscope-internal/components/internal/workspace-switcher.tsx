'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { workspacesFor } from '@/lib/rbac';
import { useSession } from '@/lib/session-context';
import { cn } from '@/lib/utils';

/**
 * Lets someone who holds several roles jump between workspaces (doc 11 §12).
 * One account, separate workspaces, renders nothing for single-role accounts.
 */
export function WorkspaceSwitcher() {
  const { roles, roleDetails, primaryRole } = useSession();
  const pathname = usePathname();

  if (roles.length < 2) return null;

  // Names and landing pages come from the API, so a custom role labels itself.
  const workspaces = workspacesFor(roleDetails);
  // The workspace whose home is the deepest match for the current path.
  const active =
    workspaces
      .filter((w) => pathname === w.href || pathname.startsWith(`${w.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    workspaces.find((w) => w.role === primaryRole) ??
    workspaces[0]!;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hover:border-navy/40 hover:text-navy hidden items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors sm:flex"
        >
          <span className="text-neutral-400">Mode:</span>
          {active.name}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <p className="px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
          Ganti Workspace
        </p>
        {workspaces.map((w) => (
          <Link
            key={w.role}
            href={w.href}
            className={cn(
              'flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors',
              w.role === active.role
                ? 'bg-navy-light text-navy font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100',
            )}
          >
            {w.name}
            <span className="text-[11px] text-neutral-400">{w.href}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
