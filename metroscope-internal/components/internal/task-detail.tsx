'use client';

import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  Paperclip,
  TriangleAlert,
  UserRound,
} from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { roleLabel } from '@/lib/user-display';
import { cn } from '@/lib/utils';

import {
  COLUMNS,
  PIC_STYLE,
  PIC_STYLE_FALLBACK,
  PRIORITY_STYLE,
  type BoardTask,
} from './task-data';

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof UserRound;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.15em] text-neutral-400 uppercase">
          {label}
        </p>
        <div className="mt-0.5 text-sm text-neutral-800">{children}</div>
      </div>
    </div>
  );
}

/**
 * Full detail for one board task (requirement 2026-07-27: cards needed detail).
 * Opened by clicking a card, the drag handle stays separate so dragging and
 * opening never conflict.
 */
export function TaskDetailDialog({
  task,
  onClose,
}: {
  task: BoardTask | null;
  onClose: () => void;
}) {
  const column = task ? COLUMNS.find((c) => c.id === task.status) : undefined;
  const priority = task ? PRIORITY_STYLE[task.priority] : undefined;
  const done = task?.status === 'DONE';

  const checked = task?.checklist?.filter((c) => c.done).length ?? 0;
  const total = task?.checklist?.length ?? 0;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {task && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                {column && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                      column.tone,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', column.dot)} aria-hidden />
                    {column.label}
                  </span>
                )}
                {priority && !done && (
                  <span
                    className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', priority.cls)}
                  >
                    {priority.label}
                  </span>
                )}
                {task.overdue && !done && (
                  <span className="bg-maroon inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white">
                    <TriangleAlert className="h-3 w-3" />
                    Terlambat
                  </span>
                )}
              </div>
              <DialogTitle className={cn(done && 'text-neutral-400 line-through')}>
                {task.title}
              </DialogTitle>
            </DialogHeader>

            {/* Description */}
            {task.description && (
              <p className="rounded-xl bg-neutral-50 p-4 text-sm leading-relaxed whitespace-pre-line text-neutral-700 ring-1 ring-neutral-100">
                {task.description}
              </p>
            )}

            {/* Meta */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Row icon={UserRound} label="Penanggung Jawab">
                <span className="font-medium">{task.assignee}</span>
                <span
                  className={cn(
                    'ml-2 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                    PIC_STYLE[task.pic] ?? PIC_STYLE_FALLBACK,
                  )}
                >
                  {roleLabel(task.pic)}
                </span>
              </Row>

              <Row icon={CalendarClock} label="Deadline">
                <span
                  className={cn(
                    'font-medium',
                    task.overdue && !done ? 'text-maroon' : 'text-neutral-800',
                  )}
                >
                  {task.due}
                </span>
              </Row>

              {task.createdBy && (
                <Row icon={UserRound} label="Diberikan Oleh">
                  {task.createdBy}
                </Row>
              )}

              {task.createdAt && (
                <Row icon={CalendarClock} label="Dibuat">
                  {task.createdAt}
                </Row>
              )}
            </div>

            {/* Checklist */}
            {task.checklist && task.checklist.length > 0 && (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-neutral-900">Checklist</p>
                  <p className="text-xs text-neutral-400">
                    {checked} dari {total} selesai
                  </p>
                </div>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="fx-bar-x h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                    style={{ width: `${total ? (checked / total) * 100 : 0}%` }}
                  />
                </div>
                <ul className="space-y-1.5">
                  {task.checklist.map((item) => (
                    <li key={item.label} className="flex items-center gap-2.5 text-sm">
                      {item.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-neutral-300" />
                      )}
                      <span
                        className={cn(
                          item.done ? 'text-neutral-400 line-through' : 'text-neutral-700',
                        )}
                      >
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Attachment */}
            {task.attachment && (
              <div>
                <p className="mb-2 text-sm font-semibold text-neutral-900">Lampiran</p>
                <button
                  type="button"
                  className="hover:border-navy/40 hover:bg-navy-light/20 flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-left transition-colors"
                >
                  <span className="bg-navy-light text-navy flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">
                      {task.attachment.name}
                    </span>
                    <span className="block text-xs text-neutral-400">{task.attachment.size}</span>
                  </span>
                  <Download className="h-4 w-4 shrink-0 text-neutral-400" />
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
