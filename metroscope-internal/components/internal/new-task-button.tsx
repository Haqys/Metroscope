import Link from 'next/link';
import { Plus } from 'lucide-react';

/** Primary CTA on the overview board, opens the task creation form. */
export function NewTaskButton() {
  return (
    <Link
      href="/tasks/new"
      className="bg-navy shadow-navy/20 hover:bg-navy-dark flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
    >
      <Plus className="h-4 w-4" />
      Tugas Baru
    </Link>
  );
}
