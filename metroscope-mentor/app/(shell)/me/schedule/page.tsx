import type { Metadata } from 'next';

import { AvailabilityEditor } from '@/components/internal/availability-editor';
import { SessionCalendar } from '@/components/internal/session-calendar';
import { SessionTable } from '@/components/internal/session-table';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { getAvailability, listSessions } from '@/lib/api';

export const metadata: Metadata = { title: 'Jadwal Mengajar Saya' };
export const dynamic = 'force-dynamic';

/**
 * The mentor's own teaching week (doc 14 §3.1).
 *
 * Six hardcoded sessions and a `TODO: scope to GET /me/sessions` until now. The
 * scoping does not need a `/me/*` endpoint: `GET /v1/sessions?scope=mine` is
 * the same route the internal app calls, and `95_scheduling.sql` gives a mentor
 * their own sessions whether or not they hold `/schedule`.
 *
 * A calendar alone cannot show status, attendance and a cancellation reason, so
 * the list below carries the operational detail, and the attendance control,
 * which doc 13 §8.3 lists as this role's "Fix required": *"attendance has no UI
 * at all today. It is a model with no screen"*.
 */
export default async function MySchedulePage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();

  const [sessions, availability] = await Promise.all([
    listSessions({ from, to, scope: 'mine', includeCancelled: true, limit: 500 }),
    getAvailability(),
  ]);

  /**
   * Sessions that have started and are not yet marked come first. That is the
   * work. Everything else is reference.
   */
  const needsMarking = sessions.items.filter(
    (s) => s.status === 'SCHEDULED' && new Date(s.startsAt) <= now,
  );
  const upcoming = sessions.items
    .filter((s) => s.status === 'SCHEDULED' && new Date(s.startsAt) > now)
    .slice(0, 12);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Jadwal Mengajar Saya"
        subtitle="Sesi les, konsultasi, dan assessment yang kamu pegang."
      />

      {needsMarking.length > 0 && (
        <section className="mt-8">
          <SectionHeading
            title={`Belum Ditandai (${needsMarking.length})`}
            subtitle="Sesi yang sudah berlangsung dan menunggu catatan kehadiran"
          />
          <div className="mt-4">
            <SessionTable sessions={needsMarking} />
          </div>
        </section>
      )}

      <div className="mt-8">
        <SessionCalendar sessions={sessions.items} />
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Sesi Berikutnya"
          subtitle="Tanggal, waktu, tautan pertemuan, dan status"
        />
        <div className="mt-4">
          <SessionTable sessions={upcoming} />
        </div>
      </section>

      <div className="mt-10">
        <AvailabilityEditor initial={availability.items} />
      </div>
    </div>
  );
}
