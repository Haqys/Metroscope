import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type KpiTone = 'navy' | 'violet' | 'emerald' | 'amber' | 'maroon';

const TONE: Record<KpiTone, { chip: string; bar: string; value?: string }> = {
  navy: { chip: 'bg-navy-light text-navy', bar: 'bg-navy' },
  violet: { chip: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  amber: { chip: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
  maroon: { chip: 'bg-maroon-light text-maroon', bar: 'bg-maroon', value: 'text-maroon' },
};

export interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  href?: string;
}

/** Headline KPI tile used across the internal dashboard (docs 05 §2.3). */
export function KpiCard({ label, value, caption, icon: Icon, tone = 'navy', href }: KpiCardProps) {
  const t = TONE[tone];
  const cls =
    'fx-hover group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]';

  const body = (
    <>
      {/* Accent rail (wireframe: coloured left border) */}
      <span className={cn('absolute inset-y-0 left-0 w-1', t.bar)} aria-hidden />

      <div className="flex items-start justify-between gap-3 pl-2">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
            t.chip,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={cn(
          'mt-1 pl-2 text-[1.75rem] leading-tight font-bold tracking-tight',
          t.value ?? 'text-neutral-900',
        )}
      >
        {value}
      </p>
      {caption && (
        <p className="mt-1 flex items-center gap-1 pl-2 text-xs text-neutral-400">
          {caption}
          {href && (
            <ArrowUpRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          )}
        </p>
      )}
    </>
  );

  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
