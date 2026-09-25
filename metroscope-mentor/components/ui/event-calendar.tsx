'use client';

import { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import idLocale from '@fullcalendar/core/locales/id';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import { ExternalLink, Video } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';

export type CalendarTone = 'navy' | 'maroon' | 'amber' | 'emerald' | 'neutral';

const TONE: Record<CalendarTone, { bg: string; text: string; dot: string }> = {
  navy: { bg: '#192e5f', text: '#ffffff', dot: '#192e5f' },
  maroon: { bg: '#7d0e03', text: '#ffffff', dot: '#7d0e03' },
  amber: { bg: '#fbbf24', text: '#1c1917', dot: '#f59e0b' },
  emerald: { bg: '#059669', text: '#ffffff', dot: '#059669' },
  neutral: { bg: '#e5e5e5', text: '#737373', dot: '#a3a3a3' },
};

const BADGE_TONE: Record<CalendarTone, string> = {
  navy: 'bg-navy-light text-navy',
  maroon: 'bg-maroon-light text-maroon',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-neutral-100 text-neutral-500',
};

export interface CalendarDetailField {
  label: string;
  value: string;
  /** Render the value as a coloured pill instead of a boxed string. */
  badge?: CalendarTone;
}

export interface CalendarLink {
  label: string;
  url: string;
  variant?: 'outline' | 'solid';
}

export interface CalendarEventData {
  id: string;
  title: string;
  start: string | Date;
  end?: string | Date;
  allDay?: boolean;
  tone?: CalendarTone;
  /** Small pills shown above the title in the detail dialog. */
  badges?: { label: string; tone: CalendarTone }[];
  fields?: CalendarDetailField[];
  /** Long free-text block (rendered with preserved line breaks). */
  body?: string;
  links?: CalendarLink[];
  meetUrl?: string;
}

export interface EventCalendarProps {
  events: CalendarEventData[];
  initialView?: string;
  initialDate?: string | Date;
  /** View buttons to expose in the toolbar. */
  views?: string[];
  height?: number | 'auto';
  className?: string;
  legend?: { tone: CalendarTone; label: string }[];
}

function toFcEvents(events: CalendarEventData[]): EventInput[] {
  return events.map((e) => {
    const t = TONE[e.tone ?? 'navy'];
    return {
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      backgroundColor: t.bg,
      borderColor: t.bg,
      textColor: t.text,
      extendedProps: { data: e },
    };
  });
}

/** Airtable-style field row: label on the left, boxed value on the right. */
function Field({ field }: { field: CalendarDetailField }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[128px_1fr] sm:items-start sm:gap-4">
      <p className="pt-2 text-sm text-neutral-400">{field.label}</p>
      <div className="rounded-xl border border-neutral-200 px-3.5 py-2 text-sm text-neutral-800">
        {field.badge ? (
          <span
            className={cn(
              'rounded-full px-3 py-0.5 text-xs font-semibold',
              BADGE_TONE[field.badge],
            )}
          >
            {field.value}
          </span>
        ) : (
          field.value
        )}
      </div>
    </div>
  );
}

/**
 * Airtable-record-style detail dialog for a calendar/competition event.
 * Shared by the calendar (event click) and the table (row click).
 */
export function EventDetailDialog({
  event,
  onClose,
}: {
  event: CalendarEventData | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {event && (
          <>
            <DialogHeader>
              {event.badges && event.badges.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {event.badges.map((b) => (
                    <span
                      key={b.label}
                      className={cn(
                        'rounded-full px-3 py-0.5 text-xs font-semibold',
                        BADGE_TONE[b.tone],
                      )}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
              <DialogTitle>{event.title}</DialogTitle>
            </DialogHeader>

            {event.fields && event.fields.length > 0 && (
              <div className="space-y-3">
                {event.fields.map((f) => (
                  <Field key={f.label} field={f} />
                ))}
              </div>
            )}

            {event.body && (
              <div>
                <p className="mb-2 text-sm font-semibold text-neutral-900">Brief Information</p>
                <div className="rounded-xl bg-neutral-50 p-4 text-sm leading-relaxed whitespace-pre-line text-neutral-700 ring-1 ring-neutral-100">
                  {event.body}
                </div>
              </div>
            )}

            {event.meetUrl && (
              <a
                href={event.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Video className="h-4 w-4" />
                Join Meet
              </a>
            )}

            {event.links && event.links.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {event.links.map((link) => (
                  <a
                    key={link.url + link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-colors',
                      link.variant === 'solid'
                        ? 'bg-maroon hover:bg-maroon-dark text-white'
                        : 'border-navy text-navy hover:bg-navy border hover:text-white',
                    )}
                  >
                    {link.label}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Google-Calendar-style calendar (FullCalendar) with an Airtable-record-style
 * detail dialog on event click. Reused by the schedule and competition views.
 */
export function EventCalendar({
  events,
  initialView = 'dayGridMonth',
  initialDate,
  views = ['dayGridMonth', 'timeGridWeek', 'listMonth'],
  height = 'auto',
  className,
  legend,
}: EventCalendarProps) {
  const [selected, setSelected] = useState<CalendarEventData | null>(null);

  const onEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    const data = arg.event.extendedProps.data as CalendarEventData | undefined;
    if (data) setSelected(data);
  };

  return (
    <div className={cn('rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5', className)}>
      <div className="ms-fc">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={initialDate}
          locale={idLocale}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: views.join(','),
          }}
          buttonText={{
            today: 'Hari Ini',
            month: 'Bulan',
            week: 'Minggu',
            day: 'Hari',
            list: 'Daftar',
          }}
          events={toFcEvents(events)}
          eventClick={onEventClick}
          height={height}
          dayMaxEvents={3}
          firstDay={1}
          nowIndicator
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          expandRows
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          fixedWeekCount={false}
        />
      </div>

      {legend && legend.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 px-1 pt-3.5 text-xs text-neutral-500">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: TONE[l.tone].dot }}
                aria-hidden
              />
              {l.label}
            </span>
          ))}
        </div>
      )}

      <EventDetailDialog event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
