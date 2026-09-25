import type { Metadata } from 'next';

import { PageHeader } from '@/components/portal/page-header';
import { ScheduleView } from '@/components/portal/schedule-view';
import { listRescheduleRequests, listSessions } from '@/lib/api';

export const metadata: Metadata = { title: 'Jadwal Les' };
export const dynamic = 'force-dynamic';

/**
 * Portal. Jadwal Les (wireframe: Ringkasan 4/8), real as of §3.1.
 *
 * No student id is passed and none should be: `app.owns_student()` returns this
 * guardian's children, and a family with two enrolled children sees both, the
 * fixture could only ever describe one.
 */
export default async function SchedulePage() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();

  const [{ items }, requests] = await Promise.all([
    listSessions({ from, to, includeCancelled: true, limit: 300 }),
    listRescheduleRequests(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Jadwal Les"
        subtitle="Lihat jadwal les rutin dan ajukan reschedule bila berhalangan."
      />

      <div className="mt-8">
        <ScheduleView sessions={items} requests={requests.items} />
      </div>
    </div>
  );
}
