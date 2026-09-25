'use client';

import { useState } from 'react';

import type { CompetitionRow } from '@/lib/api';

import { CompetitionBrowser } from './competition-browser';
import { CompetitionsView } from './competitions-view';
import { SegmentedTabs } from './segmented-tabs';

/**
 * The two tabs doc 13 §6.1 asked for: *Lomba Saya* | *Jelajahi Lomba*.
 *
 * A client boundary and nothing else. Both lists were fetched on the server,
 * so switching tabs is a state change rather than a round trip, and no token
 * touches browser JavaScript (doc 04 §0.4).
 */
const TABS = ['Lomba Saya', 'Jelajahi Lomba'] as const;
type Tab = (typeof TABS)[number];

export function CompetitionsPageClient({
  mine,
  all,
  childLevel,
}: {
  mine: CompetitionRow[];
  all: CompetitionRow[];
  childLevel: 'SD' | 'SMP' | 'SMA' | null;
}) {
  /**
   * Open on the catalogue when the child is not entered in anything. An empty
   * "Lomba Saya" as the first thing a family sees answers a question they did
   * not ask; the catalogue is the thing to do next.
   */
  const [tab, setTab] = useState<Tab>(mine.length > 0 ? 'Lomba Saya' : 'Jelajahi Lomba');

  return (
    <div>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Bagian lomba" />

      <div className="mt-6">
        {tab === 'Lomba Saya' ? (
          <CompetitionsView competitions={mine} />
        ) : (
          <CompetitionBrowser competitions={all} defaultLevel={childLevel} />
        )}
      </div>
    </div>
  );
}
