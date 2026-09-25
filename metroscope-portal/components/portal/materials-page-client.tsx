'use client';

import { useState } from 'react';

import { MaterialsView } from './materials-view';
import type { MaterialRow, StudentOption } from '@/lib/api';

/**
 * Holds which child is being looked at.
 *
 * The list is fetched per student on the server, so switching reloads. A
 * client-side cache of every child's list would be a second copy of an
 * entitlement answer the server already gives correctly, and entitlement is
 * the one thing on this page that must not be approximated.
 */
export function MaterialsPageClient({
  materials,
  students,
  studentId,
}: {
  materials: MaterialRow[];
  students: StudentOption[];
  studentId: string;
}) {
  const [current, setCurrent] = useState(studentId);

  return (
    <MaterialsView
      materials={materials}
      students={students}
      studentId={current}
      onStudentChange={(id) => {
        setCurrent(id);
        window.location.search = `?studentId=${id}`;
      }}
    />
  );
}
