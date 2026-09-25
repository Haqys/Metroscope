import type { Metadata } from 'next';

import { ProgressBoard } from '@/components/internal/progress-board';
import { PageHeader } from '@/components/portal/page-header';
import { listProgressBoard } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Progress' };
export const dynamic = 'force-dynamic';

/**
 * `/progress`, the staleness board (doc 03 FR-UPD-1, doc 13 §7.2).
 *
 * Real as of §3.6. Until now this page mapped a four-row student fixture over a
 * hand-typed `STALE_DAYS` object, `{'aditya-pratama': 3, 'keisha-amara': 16,
 * …}`, and sorted it by itself. Nothing could make those numbers move, and
 * "16 hari lalu" would have been true forever.
 *
 * The threshold, the day count and the NEVER/STALE/CURRENT state all come from
 * migration 0026's functions, so this page and `/progress/[studentId]` and the
 * portal cannot disagree about who is overdue.
 */
export default async function ProgressPage() {
  const [board, session] = await Promise.all([listProgressBoard(), requireSession()]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Progress"
        subtitle="Diurutkan dari yang paling lama tidak diperbarui, kerjakan dari atas."
      />

      <div className="mt-8">
        <ProgressBoard
          rows={board.items}
          summary={board.summary}
          staleAfterDays={board.staleAfterDays}
          canEdit={session.actions.includes('progress.edit')}
        />
      </div>
    </div>
  );
}
