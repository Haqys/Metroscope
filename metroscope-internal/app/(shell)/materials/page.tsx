import type { Metadata } from 'next';

import { MaterialManager } from '@/components/internal/material-manager';
import { PageHeader } from '@/components/portal/page-header';
import { listMaterials, listProgramOptions, listStudents } from '@/lib/api';

export const metadata: Metadata = { title: 'Materi Belajar' };
export const dynamic = 'force-dynamic';

/**
 * Internal, the material library (doc 11 §3, doc 13 §12.7).
 *
 * Real as of §3.3. The page carried a four-row fixture and its assignment
 * dialog offered targets that resolved to nothing; `GET /v1/materials` now
 * returns the library including drafts, because `materials_select` widens for
 * staff holding `/materials` and narrows to published-and-entitled for a family.
 */
export default async function MaterialsPage() {
  const [materials, students, programs] = await Promise.all([
    listMaterials(),
    listStudents(),
    listProgramOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Materi Belajar"
        subtitle="Kelola modul, sumber belajar, dan tentukan siapa yang bisa mengaksesnya."
      />

      <div className="mt-8">
        <MaterialManager
          materials={materials.items}
          students={students.items}
          programs={programs.items.map((program) => ({ id: program.id, name: program.name }))}
        />
      </div>
    </div>
  );
}
