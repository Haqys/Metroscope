'use client';

import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * "Semua tim" vs "Jadwal saya", doc 13 §7.2's `/schedule?scope=mine`.
 *
 * Links rather than state, so the scope is in the URL: a mentor can bookmark
 * their own week, and the server renders the right list on the first request
 * instead of fetching everything and filtering in the browser. §T.1 deleted the
 * duplicated `/me/schedule` route on exactly this reasoning, "same page,
 * scoped, one code path".
 */
export function ScopeTabs({ scope }: { scope: 'all' | 'mine' }) {
  const tabs = [
    { value: 'all' as const, label: 'Semua Tim', href: '/schedule' },
    { value: 'mine' as const, label: 'Jadwal Saya', href: '/schedule?scope=mine' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Cakupan jadwal"
      className="inline-flex rounded-full bg-neutral-100 p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          role="tab"
          aria-selected={scope === tab.value}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            scope === tab.value
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
