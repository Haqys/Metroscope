import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { RescheduleForm } from '@/components/forms/reschedule-form';
import { PageHeader } from '@/components/portal/page-header';
import { listSessions } from '@/lib/api';

export const metadata: Metadata = { title: 'Reschedule Jadwal Les' };
export const dynamic = 'force-dynamic';

/**
 * Portal, reschedule wizard (wireframe: Input Form 2/3).
 *
 * The sessions it offers are real as of §3.1. **The submit is not**: there is
 * no `reschedule_requests` table and no endpoint until §3.2, so the wizard
 * still ends at a confirmation screen and nothing reaches staff. doc 13 §12.6
 * calls that out as the current defect, "the parent submits into a void", and
 * §3.2 is where the request becomes an `/inbox` item somebody can act on.
 */
export default async function ReschedulePage() {
  const now = new Date();
  const { items } = await listSessions({
    from: now.toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString(),
    limit: 100,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/portal/schedule"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Jadwal Les
      </Link>

      <PageHeader
        className="mt-4"
        title="Ajukan Reschedule Jadwal Les"
        subtitle="Ajukan maksimal H-1 sebelum jadwal berlangsung."
      />

      <div className="mt-10">
        <RescheduleForm sessions={items} />
      </div>
    </div>
  );
}
