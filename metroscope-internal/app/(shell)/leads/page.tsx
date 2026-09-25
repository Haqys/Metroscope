import type { Metadata } from 'next';

import { RegistrationTable } from '@/components/internal/registration-table';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { listLeads, leadCounts, type LeadStatus } from '@/lib/api';

export const metadata: Metadata = { title: 'Pendaftar' };
export const dynamic = 'force-dynamic';

const TAB_STATUS: Record<string, LeadStatus | undefined> = {
  Menunggu: 'NEW',
  Konsultasi: 'CONSULTING',
  'Follow Up': 'NURTURING',
  'Jadi Siswa': 'CONVERTED',
  Semua: undefined,
};

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string }>;
}

/**
 * Internal, lead pipeline.
 *
 * One funnel, one page (doc 13 §4.3). Merges what were two destinations,
 * `/registrations` (inbox) and `/students/follow-up` (nurture queue), into a
 * single status-filtered view. Both old paths redirect here.
 *
 * The filter lives in the URL rather than in component state so a Secretary can
 * bookmark "everything waiting" and share a link to it. It also means the server
 * fetches only the rows for the active tab instead of shipping the whole
 * pipeline and hiding most of it.
 */
export default async function LeadsPage({ searchParams }: PageProps) {
  const { tab = 'Menunggu', q } = await searchParams;
  const status = TAB_STATUS[tab];

  const [leads, counts] = await Promise.all([listLeads({ status, q, limit: 50 }), leadCounts()]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Pendaftar"
        subtitle="Semua calon siswa, dari yang baru masuk sampai yang perlu ditindaklanjuti."
      />

      <div className="mt-8">
        {leads.items.length === 0 && !q && !counts.NEW ? (
          <EmptyState
            title="Belum ada pendaftar"
            description="Pendaftaran dari halaman depan akan muncul di sini secara otomatis."
          />
        ) : (
          <RegistrationTable rows={leads.items} counts={counts} activeTab={tab} query={q ?? ''} />
        )}
      </div>
    </div>
  );
}
