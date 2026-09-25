import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small pill/badge rendered next to the title. */
  badge?: ReactNode;
  /** Right-aligned actions (buttons, links). */
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent portal page header, a tight, modern title with an optional
 * badge and a right-aligned action slot. Replaces the ad-hoc
 * `<h1 class="font-serif text-3xl…">` blocks scattered across pages.
 */
export function PageHeader({ title, subtitle, badge, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-neutral-900 sm:text-[1.9rem] sm:leading-[1.15]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
