import type { Metadata } from 'next';

import { CompetitionsPageClient } from '@/components/portal/competitions-page-client';
import { PageHeader } from '@/components/portal/page-header';
import { listCompetitions, listStudents } from '@/lib/api';

export const metadata: Metadata = { title: 'Lomba' };
export const dynamic = 'force-dynamic';

/**
 * Portal. Lomba (doc 13 §6.1 change 3, §12.8).
 *
 * Two tabs on one page, which is what doc 13 asked for: *Lomba Saya* (this
 * child's entries) and *Jelajahi Lomba* (the catalogue). The two `[level]`
 * sub-routes are deleted along with them. They encoded the fixture's
 * junior/senior split in URLs, and the real catalogue has three school levels,
 * not two.
 *
 * Both tabs come from ONE endpoint. doc 13 §P7 named the alternative as the
 * defect: the browse list was `competition-data.ts`, the history was a second
 * array inside `competitions-view.tsx`, and no admin screen could change either.
 */
export default async function CompetitionsPage() {
  const { items: students } = await listStudents();
  const child = students[0] ?? null;

  const [mine, all] = await Promise.all([
    child ? listCompetitions({ studentId: child.id }) : Promise.resolve({ items: [] }),
    listCompetitions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Lomba"
        subtitle={
          child
            ? `Riwayat lomba ${child.name} dan katalog lomba yang bisa diikuti.`
            : 'Katalog lomba yang bisa diikuti.'
        }
      />

      <div className="mt-8">
        <CompetitionsPageClient
          mine={mine.items}
          all={all.items}
          childLevel={child?.level ?? null}
        />
      </div>
    </div>
  );
}
