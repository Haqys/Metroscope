import type { Metadata } from 'next';

import { AchievementsView } from '@/components/portal/achievements-view';
import { PageHeader } from '@/components/portal/page-header';
import { getAchievements } from '@/lib/api';

export const metadata: Metadata = { title: 'Pencapaian & Badge' };

/**
 * Portal, Pencapaian & Peringkat (FR-GAM-1/2, wireframe Ringkasan 8/8).
 *
 * `force-dynamic`: the whole page is one account's standing, and
 * `app.leaderboard_standing()` is ownership-gated. Caching it would mean
 * serving one family's rank to the next visitor.
 */
export const dynamic = 'force-dynamic';

export default async function AchievementsPage() {
  const data = await getAchievements();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Pencapaian & Peringkat"
        subtitle={
          data.student
            ? 'Dibandingkan dengan siswa satu jenjang. Makin aktif, makin naik.'
            : 'Poin, peringkat, dan badge seorang siswa.'
        }
      />

      <div className="mt-8">
        <AchievementsView data={data} />
      </div>
    </div>
  );
}
