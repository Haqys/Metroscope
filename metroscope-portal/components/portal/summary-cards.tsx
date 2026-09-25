import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SummaryStat {
  label: string;
  value: string;
  caption?: string;
  icon: LucideIcon;
  /** Icon chip tint classes, e.g. `bg-navy-light text-navy`. */
  tint: string;
  /** `warning` emphasises the value + border (e.g. overdue payment). */
  tone?: 'default' | 'warning';
  /** Makes the whole card a link (with a hover affordance). */
  href?: string;
  /** Optional mini progress bar (0–100). */
  progress?: number;
}

/** Four headline stats on the portal summary (wireframe: Ringkasan 3/8). */
export function SummaryCards({ stats }: { stats: SummaryStat[] }) {
  return (
    <div className="fx-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const warning = stat.tone === 'warning';
        const cls = cn(
          'fx-hover group flex flex-col rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]',
          warning ? 'border-maroon/25' : 'border-neutral-200/70',
        );
        const body = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-neutral-500">{stat.label}</p>
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
                  stat.tint,
                )}
              >
                <stat.icon className="h-4 w-4" />
              </span>
            </div>
            <p
              className={cn(
                'mt-1 text-[1.75rem] leading-tight font-bold tracking-tight',
                warning ? 'text-maroon' : 'text-neutral-900',
              )}
            >
              {stat.value}
            </p>
            {typeof stat.progress === 'number' && (
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="fx-bar-x from-navy to-navy/60 h-full rounded-full bg-gradient-to-r"
                  style={{ width: `${stat.progress}%` }}
                />
              </div>
            )}
            {stat.caption && (
              <p
                className={cn(
                  'mt-2 flex items-center gap-1 text-xs',
                  warning ? 'text-maroon/80 font-medium' : 'text-neutral-400',
                )}
              >
                {stat.caption}
                {stat.href && (
                  <ArrowUpRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                )}
              </p>
            )}
          </>
        );

        return stat.href ? (
          <Link key={stat.label} href={stat.href} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={stat.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
