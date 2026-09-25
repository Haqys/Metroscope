import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { SessionCalendar } from '@/components/internal/session-calendar';
import { SessionTable } from '@/components/internal/session-table';
import { ScopeTabs } from '@/components/internal/scope-tabs';
import { PageHeader } from '@/components/portal/page-header';
import { SectionHeading } from '@/components/portal/section-heading';
import { listSessions } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Jadwal' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ scope?: string }>;
}

/**
 * `/schedule`, the team calendar plus the session list (doc 13 §7.2).
 *
 * Both halves are real as of §3.1: `GET /v1/sessions` replaces the seven
 * hardcoded July 2026 agenda entries that rendered identically for everyone.
 * `?scope=mine` is doc 13 §8.3's `/schedule?scope=mine`, the mentor's own week
 * from the same page and the same query, rather than the duplicated `/me/schedule`
 * §T.1 deleted.
 *
 * **The competition half is gone (§3.4), not ported.** doc 13 §4.2 audits this
 * page as "❌ two jobs, strip competitions out; `/schedule` = scheduling only",
 * and §12.8 gives the targets and teams to `/competitions`, which "becomes the
 * portal's source of truth". Rebuilding the sidebar against the new table would
 * have kept the second job while making it look finished. `schedule-data.ts`,
 * the last fixture behind this page, is deleted.
 */
export default async function SchedulePage({ searchParams }: PageProps) {
  const [{ scope }, session] = await Promise.all([searchParams, requireSession()]);
  const mine = scope === 'mine';

  /**
   * A window, not everything. A calendar that fetched every session ever taught
   * would grow without bound and render one month of it.
   */
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();

  const { items } = await listSessions({
    from,
    to,
    scope: mine ? 'mine' : 'all',
    includeCancelled: true,
    limit: 500,
  });

  const canManage = session.actions.includes('session.manage');
  const upcoming = items
    .filter((s) => s.status === 'SCHEDULED' && new Date(s.startsAt) >= now)
    .slice(0, 12);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Jadwal"
        subtitle="Kalender gabungan tim, sesi les, dan kehadiran."
        action={
          canManage ? (
            <Link
              href="/schedule/sessions/new"
              className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              Tambah Jadwal
            </Link>
          ) : undefined
        }
      />

      <div className="mt-6">
        <ScopeTabs scope={mine ? 'mine' : 'all'} />
      </div>

      <div className="mt-6">
        <SessionCalendar sessions={items} />
      </div>

      <section className="mt-10">
        <SectionHeading
          title={mine ? 'Sesi Saya Berikutnya' : 'Sesi Berikutnya'}
          subtitle="Tandai kehadiran setelah sesi berlangsung, atau batalkan dengan alasan"
        />
        <div className="mt-4">
          <SessionTable
            sessions={upcoming}
            canManage={canManage}
            emptyHint={
              mine
                ? 'Belum ada sesi yang kamu pegang dalam rentang ini.'
                : 'Buat jadwal pertama lewat tombol Tambah Jadwal.'
            }
          />
        </div>
      </section>
    </div>
  );
}
