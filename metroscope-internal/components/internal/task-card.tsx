'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, GripVertical, TriangleAlert } from 'lucide-react';

import { ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

import { PIC_STYLE, PIC_STYLE_FALLBACK, PRIORITY_STYLE, type BoardTask } from './task-data';

/** Visual card body, shared by the sortable card and the drag overlay. */
export function TaskCardBody({
  task,
  dragging,
  overlay,
  handleProps,
  onOpen,
}: {
  task: BoardTask;
  dragging?: boolean;
  overlay?: boolean;
  handleProps?: React.HTMLAttributes<HTMLElement>;
  /** Opens the detail dialog, omitted for the drag overlay. */
  onOpen?: () => void;
}) {
  const priority = PRIORITY_STYLE[task.priority];
  const done = task.status === 'DONE';

  return (
    <article
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      aria-label={onOpen ? `Lihat detail tugas: ${task.title}` : undefined}
      className={cn(
        'group relative rounded-xl border border-neutral-200/80 bg-white p-3.5 pl-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        'transition-shadow duration-200',
        !overlay && 'hover:shadow-[0_6px_16px_rgba(16,24,40,0.08)]',
        onOpen && !overlay && 'cursor-pointer',
        dragging && 'opacity-40',
        overlay && 'scale-[1.02] rotate-[1.5deg] shadow-[0_18px_40px_rgba(16,24,40,0.18)]',
      )}
    >
      {/* Status rail */}
      <span
        className={cn(
          'absolute inset-y-2 left-0 w-1 rounded-full',
          done ? 'bg-emerald-400' : task.overdue ? 'bg-maroon' : 'bg-neutral-200',
        )}
        aria-hidden
      />

      <div className="flex items-start gap-2">
        <p
          className={cn(
            'flex-1 text-sm leading-snug font-semibold',
            done ? 'text-neutral-400 line-through' : 'text-neutral-900',
          )}
        >
          {task.title}
        </p>
        {/* Drag handle, its clicks must never reach the card, otherwise
            ending a keyboard drag with Space would also open the detail. */}
        <button
          type="button"
          {...handleProps}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Pindahkan tugas: ${task.title}`}
          className={cn(
            'shrink-0 rounded-md p-0.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500',
            overlay ? 'cursor-grabbing' : 'cursor-grab touch-none',
          )}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
            PIC_STYLE[task.pic] ?? PIC_STYLE_FALLBACK,
          )}
        >
          {ROLE_LABELS[task.pic] ?? task.pic}
        </span>
        {!done && (
          <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', priority.cls)}>
            {priority.label}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
        <span className="truncate text-xs text-neutral-400">{task.assignee}</span>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-xs font-medium',
            task.overdue && !done ? 'text-maroon' : 'text-neutral-400',
          )}
        >
          {task.overdue && !done ? (
            <TriangleAlert className="h-3 w-3" />
          ) : (
            <CalendarClock className="h-3 w-3" />
          )}
          {task.due}
        </span>
      </div>
    </article>
  );
}

/** Sortable (draggable) task card inside a board column. */
export function TaskCard({ task, onOpen }: { task: BoardTask; onOpen?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'relative z-10')}
    >
      <TaskCardBody
        task={task}
        dragging={isDragging}
        onOpen={onOpen}
        handleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>}
      />
    </div>
  );
}
