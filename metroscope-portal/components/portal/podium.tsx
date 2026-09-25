import { Crown } from 'lucide-react';

export interface PodiumEntry {
  name: string; // "Bagas N."
  points: number;
  isYou?: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Top-3 podium inside the dark rank hero. Expects entries ranked 1→3. */
export function Podium({ entries }: { entries: [PodiumEntry, PodiumEntry, PodiumEntry] }) {
  const [first, second, third] = entries;

  const cols = [
    {
      entry: second,
      rank: 2,
      barH: 'h-20',
      bar: 'from-neutral-200/90 to-neutral-400/80',
      avatar: 'bg-neutral-200 text-neutral-800',
      delay: '0.18s',
    },
    {
      entry: first,
      rank: 1,
      barH: 'h-28',
      bar: 'from-amber-300 to-amber-500',
      avatar: 'bg-amber-400 text-neutral-900 ring-2 ring-amber-200/70',
      delay: '0.06s',
    },
    {
      entry: third,
      rank: 3,
      barH: 'h-14',
      bar: 'from-amber-700/80 to-amber-800/80',
      avatar: 'bg-amber-700 text-amber-50',
      delay: '0.30s',
    },
  ];

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-4">
      {cols.map(({ entry, rank, barH, bar, avatar, delay }) => (
        <div key={rank} className="flex w-[4.5rem] flex-col items-center sm:w-24">
          <div className="flex h-5 items-end">
            {rank === 1 && (
              <Crown className="mb-0.5 h-5 w-5 text-amber-300 drop-shadow" aria-hidden />
            )}
          </div>
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold shadow-md ${avatar} ${
              entry.isYou ? 'ring-offset-navy-dark ring-2 ring-white ring-offset-2' : ''
            }`}
            aria-hidden
          >
            {initials(entry.name)}
          </span>
          <p className="mt-2 max-w-full truncate text-xs font-semibold text-white">
            {entry.name}
            {entry.isYou ? ' (Kamu)' : ''}
          </p>
          <p className="text-[11px] font-medium text-white/55">{entry.points} pts</p>
          <div
            className={`fx-bar-y mt-2 flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b ${bar} ${barH}`}
            style={{ animationDelay: delay }}
          >
            <span className="mt-1.5 text-lg font-black text-black/25">{rank}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
