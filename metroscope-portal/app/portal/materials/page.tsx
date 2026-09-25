import type { Metadata } from 'next';

import { MaterialsPageClient } from '@/components/portal/materials-page-client';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { listMaterials, listStudents } from '@/lib/api';

export const metadata: Metadata = { title: 'Materi Belajar' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ studentId?: string }>;
}

/**
 * Portal. Materi Belajar (wireframe: Ringkasan 7/8), real as of §3.3.
 *
 * The list is per CHILD, not per family: `material_progress` is keyed by
 * student, and a family with two children has two different answers to "which
 * modules are done". The fixture could only describe one.
 *
 * `studentId` comes from the query string so a switch is a navigation, the
 * server re-asks the entitlement question rather than the browser filtering a
 * merged list, which is the version that eventually shows one child a module
 * that belongs to their sibling.
 */
export default async function MaterialsPage({ searchParams }: PageProps) {
  const [{ studentId }, students] = await Promise.all([searchParams, listStudents()]);

  const current = students.items.find((s) => s.id === studentId) ?? students.items[0];

  if (!current) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Materi Belajar" subtitle="Akses materi & rekaman kelas." />
        <div className="mt-8">
          <EmptyState
            title="Belum ada siswa"
            description="Materi tampil setelah pendaftaran siswa selesai diproses."
          />
        </div>
      </div>
    );
  }

  const materials = await listMaterials(current.id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Materi Belajar"
        subtitle="Modul yang diberikan mentor sesuai program dan jenjang."
      />

      <div className="mt-8">
        <MaterialsPageClient
          materials={materials.items}
          students={students.items}
          studentId={current.id}
        />
      </div>
    </div>
  );
}
