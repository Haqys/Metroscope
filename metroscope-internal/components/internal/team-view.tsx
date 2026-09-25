'use client';

import { useState } from 'react';

import type { RoleDetail, StaffMember } from '@/lib/api';

import { UserTable } from '@/components/internal/user-table';
import { SegmentedTabs } from '@/components/portal/segmented-tabs';
import { EmptyState } from '@/components/ui/states';

/**
 * Anggota Tim. One page for the people who work here.
 *
 * Merges three destinations that all described the same humans from different
 * angles (doc 13 §4.3):
 *   /tutors          → teaching data, availability, fee
 *   /settings/users  → accounts and role grants
 *   /performance     → task completion ranking
 *
 * Keeping them apart meant answering "who is Kak Dinda?" required three pages,
 * and filing a person under Settings implied they were configuration.
 *
 * **Akun & Role is real** as of Task 0.4. The other two tabs described data
 * that does not exist yet, mentor availability needs `sessions`, and the
 * ranking needs `tasks`. They rendered fixtures: invented availability grids
 * and an invented leaderboard of real colleagues' names. On a page where the
 * neighbouring tab is now live, that is not a placeholder, it is a lie with a
 * tab of its own. They say what they are waiting for instead.
 */
const TABS = ['Anggota', 'Akun & Role', 'Kinerja'] as const;
type Tab = (typeof TABS)[number];

export function TeamView({ staff, roles }: { staff: StaffMember[]; roles: RoleDetail[] }) {
  const [tab, setTab] = useState<Tab>('Akun & Role');

  return (
    <div>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="Tampilan tim" />

      <div className="mt-6">
        {tab === 'Anggota' ? (
          <EmptyState
            title="Ketersediaan jadwal belum tersedia"
            description="Jadwal mengajar dan ketersediaan mingguan muncul di sini setelah modul Jadwal aktif (Fase 3). Sampai saat itu, akun dan role tiap orang ada di tab sebelah."
          />
        ) : null}

        {tab === 'Akun & Role' ? <UserTable rows={staff} roles={roles} /> : null}

        {tab === 'Kinerja' ? (
          <EmptyState
            title="Kinerja belum bisa dihitung"
            description="Peringkat penyelesaian tugas butuh modul Tugas yang belum dibangun (Fase 3). Menampilkan angka karangan di halaman ini justru berisiko dipakai untuk menilai orang."
          />
        ) : null}
      </div>
    </div>
  );
}
