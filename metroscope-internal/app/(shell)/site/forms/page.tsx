import type { Metadata } from 'next';

import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { SubmissionList } from '@/components/internal/submission-list';
import { listFormSubmissions } from '@/lib/api';

export const metadata: Metadata = { title: 'Pesan Masuk' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ handled?: string }>;
}

/**
 * The contact inbox (doc 13 §9.4, /site/forms).
 *
 * Gated on `/leads`, not on a CMS grant: a contact message and a registration
 * are the same kind of work, somebody wants something from us, and splitting
 * them across two grants means a Secretary sees one queue and not the other.
 */
export default async function FormsPage({ searchParams }: PageProps) {
  const { handled } = await searchParams;
  const showHandled = handled === 'true';
  const { items } = await listFormSubmissions(showHandled);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Pesan Masuk"
        subtitle="Pesan dari formulir kontak di situs. Tandai selesai setelah dibalas."
      />
      <div className="mt-6">
        <SubmissionList items={items} showHandled={showHandled} />
      </div>
      {items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={showHandled ? 'Belum ada yang selesai' : 'Tidak ada pesan baru'}
            description="Pesan dari /contact akan muncul di sini."
          />
        </div>
      )}
    </div>
  );
}
