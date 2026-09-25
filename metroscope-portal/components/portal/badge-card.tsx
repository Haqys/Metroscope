import { Lock, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface BadgeItem {
  name: string; // "Konsisten 10x"
  description: string; // "Hadir les tanpa bolong"
  icon: LucideIcon;
  earned: boolean;
  isNew?: boolean;
  /** For locked badges, progress toward earning it (0–100). */
  progressPct?: number;
}

/** One badge in the collection, earned (amber glow) or locked (grey + progress). */
export function BadgeCard({ badge }: { badge: BadgeItem }) {
  return (
    <div
      className={cn(
        'fx-hover group relative flex flex-col items-center rounded-2xl border p-5 text-center',
        badge.earned
          ? 'border-amber-200/80 bg-gradient-to-b from-amber-50 to-white'
          : 'border-neutral-200/80 bg-neutral-50/70',
      )}
    >
      {badge.isNew && (
        <span className="bg-maroon absolute -top-2 -right-2 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase shadow-sm">
          Baru!
        </span>
      )}
      <span
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105',
          badge.earned
            ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-neutral-900 shadow-lg shadow-amber-500/25'
            : 'bg-neutral-200 text-neutral-400',
        )}
      >
        {badge.earned ? <badge.icon className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
      </span>
      <p className="mt-3.5 text-sm font-semibold text-neutral-900">{badge.name}</p>
      <p className="mt-1 text-xs text-neutral-400">
        {badge.earned ? badge.description : 'Belum tercapai'}
      </p>

      {!badge.earned && typeof badge.progressPct === 'number' && (
        <div className="mt-3 w-full">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="fx-bar-x h-full rounded-full bg-neutral-400"
              style={{ width: `${badge.progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-neutral-400">
            {badge.progressPct}% menuju badge
          </p>
        </div>
      )}
    </div>
  );
}
