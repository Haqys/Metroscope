import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Compact, modern section header used within portal pages. */
export function SectionHeading({ title, subtitle, action, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-neutral-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
