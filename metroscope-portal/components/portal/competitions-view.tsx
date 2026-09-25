'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Trophy, Medal } from 'lucide-react';

import type { CompetitionRow } from '@/lib/api';
import { formatDeadline, LEVEL_LABEL, RESULT_LABEL } from '@/lib/competition-display';

import {
  CompetitionTimeline,
  type CompetitionEntry,
  type CompetitionKind,
} from './competition-timeline';
import { SegmentedTabs } from './segmented-tabs';

/**
 * "Lomba Saya". This child's competition history (doc 13 §12.8).
 *
 * Real as of §3.4. This component held its OWN hardcoded array of five entries,
 * a second fixture, separate from `competition-data.ts`, so the portal showed
 * two invented lists side by side on one page. Both are gone. Every row here is
 * a `competition_targets` row for a child the caller owns, which is what
 * `competition_targets_select` returns and nothing more.
 *
 * The timeline's visual vocabulary is kept, juara1 / finalis / upcoming, but
 * it is now DERIVED from the recorded result rather than typed by hand.
 */
function kindFor(c: CompetitionRow): CompetitionKind {
  if (c.myResult === 'WINNER') return 'juara1';
  if (c.myResult === 'FINALIST') return 'finalis';
  if (c.myResult === 'PARTICIPANT') return 'juara2';
  if (c.myResult === 'WITHDRAWN') return 'milestone';
  /** PENDING with a deadline still ahead is the one thing the family can act on. */
  return c.phase === 'CLOSED' ? 'milestone' : 'upcoming';
}

function toEntry(c: CompetitionRow): CompetitionEntry {
  const days = Math.ceil((new Date(c.registrationDeadline).getTime() - Date.now()) / 86_400_000);
  return {
    date: formatDeadline(c.registrationDeadline),
    title: c.name,
    meta: [
      c.categories[0] ?? c.organizer ?? null,
      LEVEL_LABEL[c.level],
      c.myReadiness !== null && c.myResult === 'PENDING' ? `Kesiapan ${c.myReadiness}%` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    kind: kindFor(c),
    badge: c.myAward ?? RESULT_LABEL[c.myResult ?? 'PENDING'],
    chip: c.myResult === 'PENDING' && days > 0 ? `${days} hari lagi` : undefined,
  };
}

const TABS = ['Semua', 'Sudah Selesai', 'Akan Datang'] as const;
type Tab = (typeof TABS)[number];

export function CompetitionsView({ competitions }: { competitions: CompetitionRow[] }) {
  const [tab, setTab] = useState<Tab>('Semua');

  const stats = useMemo(() => {
    const done = competitions.filter((c) => c.myResult && c.myResult !== 'PENDING');
    const wins = competitions.filter((c) => c.myResult === 'WINNER' || c.myResult === 'FINALIST');
    const upcoming = competitions.filter((c) => c.myResult === 'PENDING' && c.phase !== 'CLOSED');
    return [
      {
        label: 'Total Lomba Diikuti',
        value: `${competitions.length} kali`,
        icon: Trophy,
        iconClass: 'bg-maroon-light text-maroon',
      },
      {
        label: 'Juara & Finalis',
        value: `${wins.length} kali`,
        icon: Medal,
        iconClass: 'bg-amber-100 text-amber-600',
        /** Counting only decided outcomes; PENDING is neither a win nor a loss. */
        hint: `${done.length} sudah ada hasil`,
      },
      {
        label: 'Lomba Mendatang',
        value: `${upcoming.length} terjadwal`,
        icon: CalendarClock,
        iconClass: 'bg-navy-light text-navy',
      },
    ];
  }, [competitions]);

  const list = useMemo(() => {
    const decided = (c: CompetitionRow) => c.myResult !== null && c.myResult !== 'PENDING';
    const rows =
      tab === 'Semua'
        ? competitions
        : tab === 'Sudah Selesai'
          ? competitions.filter(decided)
          : competitions.filter((c) => !decided(c) && c.phase !== 'CLOSED');
    return rows
      .slice()
      .sort(
        (a, b) =>
          new Date(b.registrationDeadline).getTime() - new Date(a.registrationDeadline).getTime(),
      )
      .map(toEntry);
  }, [competitions, tab]);

  return (
    <div>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Filter lomba" />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${stat.iconClass}`}
            >
              <stat.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium tracking-wider text-neutral-400 uppercase">
                {stat.label}
              </p>
              <p className="mt-0.5 font-serif text-2xl font-medium tracking-tight text-neutral-900">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
          Timeline Kompetisi
        </h2>
        <div className="mt-6">
          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm text-neutral-400">
              {competitions.length === 0
                ? 'Belum terdaftar di lomba mana pun. Jelajahi katalog di bawah dan bicarakan dengan mentor.'
                : 'Tidak ada lomba di kategori ini.'}
            </p>
          ) : (
            <CompetitionTimeline entries={list} />
          )}
        </div>
      </section>
    </div>
  );
}
