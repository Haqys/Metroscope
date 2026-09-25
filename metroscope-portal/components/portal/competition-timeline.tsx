import { CalendarClock, Medal, Sparkles, Star, Trophy, type LucideIcon } from 'lucide-react';

export type CompetitionKind = 'juara1' | 'juara2' | 'finalis' | 'upcoming' | 'milestone';

export interface CompetitionEntry {
  date: string; // "14 Mei 2025"
  title: string; // "Juara 1. OSN Tingkat Kota"
  meta: string; // "Matematika · Skor 92/100"
  kind: CompetitionKind;
  badge: string; // "Juara 1"
  chip?: string; // e.g. "35 hari lagi"
}

const KIND_STYLES: Record<
  CompetitionKind,
  { icon: LucideIcon; dot: string; badge: string; card: string }
> = {
  juara1: {
    icon: Trophy,
    dot: 'bg-amber-400 text-neutral-900',
    badge: 'bg-amber-100 text-amber-700',
    card: 'border-neutral-200 bg-white',
  },
  juara2: {
    icon: Medal,
    dot: 'bg-neutral-300 text-neutral-700',
    badge: 'bg-neutral-200 text-neutral-700',
    card: 'border-neutral-200 bg-white',
  },
  finalis: {
    icon: Star,
    dot: 'bg-navy text-white',
    badge: 'bg-navy-light text-navy',
    card: 'border-neutral-200 bg-white',
  },
  upcoming: {
    icon: CalendarClock,
    dot: 'bg-maroon text-white',
    badge: 'bg-maroon text-white',
    card: 'border-maroon/20 bg-maroon-light/70',
  },
  milestone: {
    icon: Sparkles,
    dot: 'bg-white text-maroon ring-2 ring-maroon/30',
    badge: 'bg-neutral-100 text-neutral-500',
    card: 'border-dashed border-neutral-300 bg-neutral-50/60',
  },
};

/** Card-based competition timeline: rail with themed icon dots + result cards. */
export function CompetitionTimeline({ entries }: { entries: CompetitionEntry[] }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-neutral-200 pl-8 sm:pl-10">
      {entries.map((entry) => {
        const style = KIND_STYLES[entry.kind];
        return (
          <li key={`${entry.date}-${entry.title}`} className="relative">
            {/* Rail dot */}
            <span
              className={`absolute top-5 -left-[3.25rem] flex h-9 w-9 items-center justify-center rounded-full sm:-left-[3.75rem] ${style.dot}`}
              aria-hidden
            >
              <style.icon className="h-4 w-4" />
            </span>

            <div
              className={`rounded-2xl border p-5 transition-shadow hover:shadow-md sm:p-6 ${style.card}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-wider text-neutral-400 uppercase">
                    {entry.date}
                  </p>
                  <h3 className="mt-1.5 font-serif text-xl font-medium tracking-tight text-neutral-900">
                    {entry.title}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">{entry.meta}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${style.badge}`}
                  >
                    {entry.badge}
                  </span>
                  {entry.chip && (
                    <span className="text-maroon ring-maroon/20 rounded-full bg-white px-3 py-1 text-xs font-medium ring-1">
                      {entry.chip}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
