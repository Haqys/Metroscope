'use client';

import { useState } from 'react';

import { ModuleCard } from './module-card';
import { SegmentedTabs } from './segmented-tabs';
import type { MaterialRow, StudentOption } from '@/lib/api';

const ALL = 'Semua Modul';

/**
 * The family's module list (doc 13 §12.7, doc 14 §3.3).
 *
 * Every module here is one this child was actually given: `materials_select`
 * returns PUBLISHED modules they are entitled to and nothing else, so there is
 * no filtering to do on this side and none is done.
 *
 * The topic chips are derived from what came back rather than from a fixed
 * list, a topic with no entitled modules is a chip that leads nowhere.
 */
export function MaterialsView({
  materials,
  students,
  studentId,
  onStudentChange,
}: {
  materials: MaterialRow[];
  students: StudentOption[];
  studentId: string;
  onStudentChange: (id: string) => void;
}) {
  const [topic, setTopic] = useState(ALL);

  const topics = [ALL, ...new Set(materials.map((m) => m.topicName).filter(Boolean))] as string[];
  const list = topic === ALL ? materials : materials.filter((m) => m.topicName === topic);
  const doneCount = materials.filter((m) => m.progressStatus === 'DONE').length;

  return (
    <div>
      {/*
        A picker only when there is a choice. Most families have one child, and
        a one-option selector is a control that teaches nothing.
      */}
      {students.length > 1 && (
        <div className="mb-4">
          <label htmlFor="student" className="text-sm font-medium text-neutral-700">
            Siswa
          </label>
          <select
            id="student"
            value={studentId}
            onChange={(e) => onStudentChange(e.target.value)}
            className="focus:border-navy focus:ring-navy/20 mt-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <SegmentedTabs
        tabs={topics}
        value={topic}
        onChange={setTopic}
        label="Filter topik"
        aside={
          <p className="text-sm text-neutral-400">
            {doneCount} dari {materials.length} modul selesai
          </p>
        }
      />

      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((material) => (
          <ModuleCard key={material.id} material={material} />
        ))}
      </div>

      {list.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          {materials.length === 0
            ? 'Belum ada materi untuk siswa ini. Mentor akan memberikannya sesuai program.'
            : 'Belum ada modul untuk topik ini.'}
        </p>
      )}
    </div>
  );
}
