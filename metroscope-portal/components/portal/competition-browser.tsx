'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Table2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CompetitionRow } from '@/lib/api';

import { CompetitionCalendar } from './competition-calendar';
import { CompetitionTable } from './competition-table';

const VIEWS = [
  { key: 'calendar', label: 'Kalender', icon: CalendarDays },
  { key: 'table', label: 'Tabel', icon: Table2 },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];
const SCHOOL_LEVELS = ['SD', 'SMP', 'SMA'] as const;

/**
 * Info Lomba. One browser, two views (doc 13 §12.8).
 *
 * The level filter replaces the `/portal/competitions/junior|senior` routes
 * §3.4 deleted. Those two paths were the fixture's `eligibilityLevel:
 * 'junior' | 'senior' | 'both'` promoted into URLs, and they could not express
 * "SD only" at all, which the real catalogue does, because IID runs a track for
 * six-year-olds. The chips read the row's own `levels`.
 */
export function CompetitionBrowser({
  competitions,
  defaultLevel,
}: {
  competitions: CompetitionRow[];
  /** The child's own level, so the list opens on what is relevant to them. */
  defaultLevel?: 'SD' | 'SMP' | 'SMA' | null;
}) {
  const [view, setView] = useState<ViewKey>('calendar');
  const [level, setLevel] = useState<string | null>(defaultLevel ?? null);

  const filtered = useMemo(() => {
    if (!level) return competitions;
    /**
     * A lomba with no levels recorded is shown to everyone rather than to
     * nobody. An empty array means "not yet specified", and hiding it would
     * make an unfinished record indistinguishable from an irrelevant one.
     */
    return competitions.filter((c) => c.levels.length === 0 || c.levels.includes(level as 'SD'));
  }, [competitions, level]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-full bg-neutral-100 p-1"
          role="tablist"
          aria-label="Tampilan lomba"
        >
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                view === v.key
                  ? 'text-navy bg-white shadow-sm'
                  : 'hover:text-navy text-neutral-500',
              )}
            >
              <v.icon className="h-4 w-4" />
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={level === null} onClick={() => setLevel(null)}>
            Semua jenjang
          </FilterChip>
          {SCHOOL_LEVELS.map((l) => (
            <FilterChip key={l} active={level === l} onClick={() => setLevel(l)}>
              {l}
            </FilterChip>
          ))}
        </div>
      </div>

      {view === 'calendar' ? (
        <CompetitionCalendar competitions={filtered} />
      ) : (
        <CompetitionTable competitions={filtered} />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-navy text-white'
          : 'border border-neutral-200 text-neutral-600 hover:border-neutral-300',
      )}
    >
      {children}
    </button>
  );
}
