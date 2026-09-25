'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SegmentedTabsProps<T extends string> {
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  label?: string;
  /** Optional node rendered on the right side of the row. */
  aside?: ReactNode;
  className?: string;
}

/**
 * Modern segmented control (soft pill container, white active chip). Replaces
 * the repeated navy/white pill-tab rows across portal views.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  aside,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <div
        className="inline-flex flex-wrap items-center gap-1 rounded-full border border-neutral-200/70 bg-neutral-100/70 p-1"
        role="tablist"
        aria-label={label}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={value === tab}
            onClick={() => onChange(tab)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200',
              value === tab
                ? 'text-navy bg-white shadow-sm ring-1 ring-neutral-200/80'
                : 'text-neutral-500 hover:text-neutral-800',
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      {aside}
    </div>
  );
}
