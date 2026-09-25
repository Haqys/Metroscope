import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { RescheduleQueue } from '@/components/internal/reschedule-queue';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { listRescheduleRequests } from '@/lib/api';

export const metadata: Metadata = { title: 'Permintaan Reschedule' };
export const dynamic = 'force-dynamic';

/**
 * The queue `/inbox` points at (doc 13 §12.6, doc 14 §3.2).
 *
 * Pending first and on their own, because that is the work; everything decided
 * sits below as a record. The split is deliberate rather than a filter tab: an
 * inbox item promises a decision, and landing on a mixed list of thirty rows
 * where four need you is how a queue stops being read.
 */
export default async function ReschedulePage() {
  const [pending, recent] = await Promise.all([
    listRescheduleRequests({ status: 'PENDING' }),
    listRescheduleRequests({ limit: 40 }),
  ]);

  const decided = recent.items.filter((r) => r.status !== 'PENDING');

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/schedule"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Jadwal
      </Link>

      <PageHeader
        className="mt-4"
        title="Permintaan Reschedule"
        subtitle="Menyetujui akan membatalkan sesi lama dan membuat penggantinya dalam satu langkah."
      />

      <section className="mt-8">
        <SectionHeading
          title={`Menunggu Keputusan (${pending.items.length})`}
          subtitle="Keluarga sudah diberi tahu bahwa kami membalas dalam 1×24 jam"
        />
        <div className="mt-4">
          <RescheduleQueue requests={pending.items} />
        </div>
      </section>

      {decided.length > 0 && (
        <section className="mt-10">
          <SectionHeading title="Sudah Diputuskan" subtitle="40 permintaan terakhir" />
          <div className="mt-4">
            <RescheduleQueue requests={decided} />
          </div>
        </section>
      )}
    </div>
  );
}
