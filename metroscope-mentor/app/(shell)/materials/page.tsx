import type { Metadata } from 'next';

import { MaterialManager } from '@/components/internal/material-manager';
import { PageHeader } from '@/components/portal/page-header';
import { listMaterials, listProgramOptions, listStudents } from '@/lib/api';

export const metadata: Metadata = { title: 'Materi Belajar' };
export const dynamic = 'force-dynamic';

/**
 * Mentor, the material library (doc 13 §8.3: "assign material" is a Mentor
 * action, and §T.1 deleted the duplicate `/me/materials` in favour of this).
 *
 * The same screen the internal app renders, against the same endpoint. A
 * mentor holds `material.manage`, the verb added in §3.3, so they author,
 * publish and assign; what they cannot do is write a student's progress, which
 * `material_progress_write` refuses outright.
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
