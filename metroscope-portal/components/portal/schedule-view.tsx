'use client';

import { useState } from 'react';

import { AttendanceTable } from './attendance-table';
import { ScheduleCalendar } from './schedule-calendar';
import { SegmentedTabs } from './segmented-tabs';
import { UpcomingLessonCard } from './upcoming-lesson-card';
import type { RescheduleRequest, SessionRow } from '@/lib/api';

const TABS = ['Bulan Ini', 'Minggu Ini', 'Selesai', 'Dibatalkan'] as const;
type Tab = (typeof TABS)[number];

const LIST_HEADINGS: Record<Tab, string> = {
  'Bulan Ini': 'Jadwal Mendatang',
  'Minggu Ini': 'Jadwal Minggu Ini',
  Selesai: 'Les Selesai',
  Dibatalkan: 'Jadwal Dibatalkan',
};

/**
 * The family's schedule (doc 14 §3.1).
 *
 * Every filter below used to compare a *day number* against constants baked
 * into the fixture, `TODAY = 16`, `WEEK_RANGE = [13, 19]`, which meant the
 * page was permanently describing the middle of July 2026. They are now
 * computed from the clock, so "Minggu Ini" means this week.
 */
function listFor(tab: Tab, sessions: SessionRow[]): SessionRow[] {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  switch (tab) {
    case 'Bulan Ini':
      return sessions.filter((s) => s.status === 'SCHEDULED' && new Date(s.startsAt) >= now);
    case 'Minggu Ini':
      return sessions.filter((s) => {
        const at = new Date(s.startsAt);
        return s.status === 'SCHEDULED' && at >= now && at <= weekAhead;
      });
    case 'Selesai':
      return sessions.filter((s) => s.status === 'DONE' || s.status === 'NO_SHOW');
    case 'Dibatalkan':
      return sessions.filter((s) => s.status === 'CANCELLED');
  }
}

export function ScheduleView({
  sessions,
  requests,
}: {
  sessions: SessionRow[];
  requests: RescheduleRequest[];
}) {
  /** Keyed by the lesson they concern, at most one open request each. */
  const pending = new Map(
    requests.filter((r) => r.status === 'PENDING').map((r) => [r.sessionId, r]),
  );
  const [tab, setTab] = useState<Tab>('Bulan Ini');
  const list = listFor(tab, sessions);

  /** History is what has already happened, marked or not. */
  const history = sessions.filter((s) => s.status === 'DONE' || s.status === 'NO_SHOW');

  return (
    <div>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Filter jadwal" />

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <ScheduleCalendar sessions={sessions} />
        </div>

        <div className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)] xl:col-span-5">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
            {LIST_HEADINGS[tab]}
          </h2>
          <div className="mt-4 space-y-3.5">
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 px-5 py-10 text-center text-sm text-neutral-400">
                Tidak ada jadwal di kategori ini 🎉
              </p>
            ) : (
              list.map((session) => (
                <UpcomingLessonCard
                  key={session.id}
                  session={session}
                  pendingRequest={pending.get(session.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Riwayat Kehadiran</h2>
        <div className="mt-4">
          {history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-5 py-10 text-center text-sm text-neutral-400">
              Belum ada les yang selesai.
            </p>
          ) : (
            <AttendanceTable sessions={history} />
          )}
        </div>
      </section>
    </div>
  );
}
