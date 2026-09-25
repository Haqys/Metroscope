'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { TaskStatus } from '@/lib/types';

import { cn } from '@/lib/utils';

import { TaskCard, TaskCardBody } from './task-card';
import { TaskDetailDialog } from './task-detail';
import { COLUMNS, INITIAL_TASKS, type BoardTask } from './task-data';

/** One droppable column; stays a drop target even when empty. */
function Column({
  column,
  tasks,
  activeId,
  onOpen,
}: {
  column: (typeof COLUMNS)[number];
  tasks: BoardTask[];
  activeId: string | null;
  onOpen: (t: BoardTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const isEmpty = tasks.length === 0;

  return (
    <section
      className={cn(
        'flex min-h-[22rem] flex-col rounded-2xl border p-3 transition-colors duration-200',
        isOver ? 'border-navy/30 bg-navy-light/50' : 'border-neutral-200/70 bg-neutral-100/60',
      )}
      aria-label={column.label}
    >
      {/* Column header */}
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            column.tone,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', column.dot)} aria-hidden />
          {column.label}
        </span>
        <span className="text-xs font-semibold text-neutral-400">{tasks.length}</span>
      </div>

      {/* Cards */}
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2.5">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => onOpen(task)} />
          ))}
        </SortableContext>

        {isEmpty && (
          <div
            className={cn(
              'flex flex-1 items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-xs transition-colors',
              isOver
                ? 'border-navy/40 text-navy bg-white/70'
                : 'border-neutral-300/80 text-neutral-400',
            )}
          >
            {activeId ? 'Lepas di sini' : 'Belum ada tugas'}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Kanban task board (Papan Tugas) with drag-and-drop powered by @dnd-kit.
 * Cards can be reordered within a column and moved across columns; keyboard
 * users can drag with Space/Enter + arrow keys.
 * TODO: persist moves via `PATCH /tasks/:id` (tasks module).
 */
export function TaskBoard() {
  const [tasks, setTasks] = useState<BoardTask[]>(INITIAL_TASKS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BoardTask | null>(null);

  const sensors = useSensors(
    // A small distance threshold keeps clicks from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = useMemo(() => {
    const map = {} as Record<TaskStatus, BoardTask[]>;
    for (const col of COLUMNS) map[col.id] = tasks.filter((t) => t.status === col.id);
    return map;
  }, [tasks]);

  const activeTask = activeId ? (tasks.find((t) => t.id === activeId) ?? null) : null;
  const donePct = tasks.length
    ? Math.round((tasks.filter((t) => t.status === 'DONE').length / tasks.length) * 100)
    : 0;

  /** Resolve the column an id belongs to (a card id or a column id). */
  const columnOf = (id: string): TaskStatus | null => {
    if (COLUMNS.some((c) => c.id === id)) return id as TaskStatus;
    return tasks.find((t) => t.id === id)?.status ?? null;
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  /** Move the dragged card into the hovered column as soon as it crosses over. */
  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeCol = columnOf(String(active.id));
    const overCol = columnOf(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === String(active.id) ? { ...t, status: overCol } : t)),
    );
  };

  /** Reorder within the destination column. */
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);
    if (draggedId === overId) return;

    setTasks((prev) => {
      const col = prev.find((t) => t.id === draggedId)?.status;
      const overCol = COLUMNS.some((c) => c.id === overId)
        ? (overId as TaskStatus)
        : prev.find((t) => t.id === overId)?.status;
      // Cross-column moves are already applied in onDragOver.
      if (!col || col !== overCol) return prev;

      // Reorder inside the column, then splice the result back into the list.
      const colTasks = prev.filter((t) => t.status === col);
      const from = colTasks.findIndex((t) => t.id === draggedId);
      const to = colTasks.findIndex((t) => t.id === overId);
      if (from === -1 || to === -1) return prev;

      const reordered = arrayMove(colTasks, from, to);
      let i = 0;
      return prev.map((t) => (t.status === col ? reordered[i++]! : t));
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* Live completion summary */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-200/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-500 ease-out"
            style={{ width: `${donePct}%` }}
            role="progressbar"
            aria-valuenow={donePct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <p className="text-xs text-neutral-500">
          <strong className="font-semibold text-neutral-800">{byColumn.DONE.length}</strong> dari{' '}
          {tasks.length} tugas selesai
        </p>
        <p className="text-xs text-neutral-400">Seret kartu untuk memindahkan status</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            column={col}
            tasks={byColumn[col.id]}
            activeId={activeId}
            onOpen={setDetail}
          />
        ))}
      </div>

      {/* Floating card that follows the cursor */}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeTask ? <TaskCardBody task={activeTask} overlay /> : null}
      </DragOverlay>

      <TaskDetailDialog task={detail} onClose={() => setDetail(null)} />
    </DndContext>
  );
}
