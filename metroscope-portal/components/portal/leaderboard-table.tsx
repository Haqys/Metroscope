import { cn } from '@/lib/utils';

export interface LeaderboardRow {
  rank: number;
  name: string;
  level: string; // "Juara Muda"
  points: number;
  isYou?: boolean;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const RANK_RING: Record<number, string> = {
  1: 'bg-amber-100 text-amber-700 ring-amber-200',
  2: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
  3: 'bg-orange-100 text-orange-700 ring-orange-200',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Full leaderboard, scoped to the same level (FR-GAM-1/2).
 *
 * `ranked` says whether the ordering means anything yet. It does not while
 * every student sits on zero points, which is the state of this school until
 * the point ledger lands: `rank()` correctly gives all of them first place,
 * and the medals then render ten gold discs down the page, each claiming a
 * win nobody has had. Positions are still shown, as plain numbers.
 */
export function LeaderboardTable({
  rows,
  ranked = true,
}: {
  rows: LeaderboardRow[];
  ranked?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.points), 1);

  return (
    <div className="fx-stagger overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      {rows.map((row, i) => (
        <div
          key={`${row.rank}-${row.name}-${i}`}
          className={cn(
            'flex items-center gap-3 px-4 py-3.5 transition-colors sm:gap-4 sm:px-5',
            i > 0 && 'border-t border-neutral-100',
            row.isYou ? 'bg-navy-light/60' : 'hover:bg-neutral-50/70',
          )}
        >
          {/* Rank */}
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1',
              (ranked ? RANK_RING[row.rank] : undefined) ??
                'bg-neutral-50 text-neutral-400 ring-neutral-200',
            )}
            aria-label={`Peringkat ${row.rank}`}
          >
            {(ranked ? MEDAL[row.rank] : undefined) ?? row.rank}
          </span>

          {/* Avatar */}
          <span
            className={cn(
              'hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:flex',
              row.isYou ? 'bg-navy text-white' : 'bg-neutral-100 text-neutral-500',
            )}
            aria-hidden
          >
            {initials(row.name)}
          </span>

          {/* Name + point bar */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <p
                className={cn(
                  'truncate text-sm font-semibold',
                  row.isYou ? 'text-navy' : 'text-neutral-800',
                )}
              >
                {row.name}
                {row.isYou ? ' (Kamu)' : ''}
              </p>
              <span className="hidden text-xs text-neutral-400 sm:inline">· {row.level}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className={cn(
                  'fx-bar-x h-full rounded-full',
                  row.isYou
                    ? 'from-navy to-navy/60 bg-gradient-to-r'
                    : 'bg-gradient-to-r from-neutral-400 to-neutral-300',
                )}
                style={{ width: `${Math.round((row.points / max) * 100)}%` }}
              />
            </div>
          </div>

          {/* Points */}
          <p className="w-16 shrink-0 text-right text-sm font-bold text-neutral-900">
            {row.points}
            <span className="ml-0.5 text-[11px] font-medium text-neutral-400">pts</span>
          </p>
        </div>
      ))}
    </div>
  );
}
