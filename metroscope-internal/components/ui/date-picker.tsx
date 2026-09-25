'use client';

import { useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const WEEKDAYS = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'];

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  /** Dates strictly before this are disabled. */
  minDate?: Date;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

/** Popover month-grid date picker. All date math via date-fns. */
export function DatePicker({
  value,
  onChange,
  minDate,
  placeholder = 'Pilih tanggal',
  disabled,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(value ?? minDate ?? new Date());

  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(view), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const min = minDate ? startOfDay(minDate) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'hover:border-navy/50 focus:border-navy focus:ring-navy/20 flex w-full items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-left text-sm transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            !value && 'text-neutral-400',
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-neutral-400" />
          {value ? format(value, 'EEEE, d MMMM yyyy', { locale: idLocale }) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[19rem]" align="start">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView((v) => addMonths(v, -1))}
            aria-label="Bulan sebelumnya"
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-neutral-900">
            {format(view, 'MMMM yyyy', { locale: idLocale })}
          </p>
          <button
            type="button"
            onClick={() => setView((v) => addMonths(v, 1))}
            aria-label="Bulan berikutnya"
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="pb-1 text-[10px] font-semibold tracking-wider text-neutral-400 uppercase"
            >
              {d}
            </span>
          ))}
          {days.map((day) => {
            const isDisabled = min ? isBefore(day, min) : false;
            const selected = value ? isSameDay(day, value) : false;
            const outside = !isSameMonth(day, view);
            const today = isSameDay(day, new Date());
            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  onChange(day);
                  setOpen(false);
                }}
                className={cn(
                  'mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors',
                  selected
                    ? 'bg-navy text-white'
                    : today
                      ? 'bg-navy-light text-navy'
                      : outside
                        ? 'text-neutral-300 hover:bg-neutral-100'
                        : 'text-neutral-700 hover:bg-neutral-100',
                  isDisabled && 'cursor-not-allowed text-neutral-200 hover:bg-transparent',
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
