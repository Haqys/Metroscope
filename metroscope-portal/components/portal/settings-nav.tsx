'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/portal/settings', label: 'Profil' },
  { href: '/portal/settings/security', label: 'Keamanan' },
];

/** Tab navigation for the settings area. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2" aria-label="Pengaturan">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-navy text-white'
                : 'hover:text-navy bg-white text-neutral-600 ring-1 ring-neutral-200'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
