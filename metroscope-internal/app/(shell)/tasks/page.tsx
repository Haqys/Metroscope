import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { TaskBoard } from '@/components/internal/task-board';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Tugas' };

/**
 * Tugas, the delegation board, promoted out of /overview.
 *
 * The page catalogue granted `/tasks` to all five system roles while no page
 * existed, so every role had a menu item that 404'd (doc 13 §3 P5). This is
 * that page.
 *
 * The board itself is the component already built for the Head's overview;
 * scoping it to "mine" vs "team" arrives with `GET /v1/tasks?scope=` in Phase 1.
 */
export default function TasksPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tugas"
        subtitle="Papan delegasi tim, geser kartu untuk memindahkan status."
        action={
          <Link
            href="/tasks/new"
            className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tugas Baru
          </Link>
        }
      />

      <div className="mt-8">
        <TaskBoard />
      </div>
    </div>
  );
}
