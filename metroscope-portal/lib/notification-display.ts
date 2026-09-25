import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  ReceiptText,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';

/**
 * How a notification reads on screen.
 *
 * A plain module with no `'use client'`, so the archive page (server) and the
 * topbar bell (client) render the same row the same way. The API already
 * decides the TITLE and the DESTINATION, those depend on the template and on
 * data, so they belong on the server; what is left here is the icon and the
 * tint, which are pure presentation and would be a needless payload field.
 */
export interface NotificationPresentation {
  icon: LucideIcon;
  tint: string;
}

const BY_CATEGORY: Record<string, NotificationPresentation> = {
  BILLING: { icon: ReceiptText, tint: 'bg-maroon-light text-maroon' },
  SCHEDULE: { icon: CalendarClock, tint: 'bg-navy-light text-navy' },
  ASSESSMENT: { icon: ClipboardCheck, tint: 'bg-violet-50 text-violet-600' },
  ACCOUNT: { icon: UserRoundCheck, tint: 'bg-emerald-50 text-emerald-600' },
};

const FALLBACK: NotificationPresentation = { icon: Bell, tint: 'bg-neutral-100 text-neutral-500' };

export const presentationFor = (category: string): NotificationPresentation =>
  BY_CATEGORY[category] ?? FALLBACK;

const RELATIVE = [
  { limit: 60, divisor: 1, unit: 'detik' },
  { limit: 3600, divisor: 60, unit: 'menit' },
  { limit: 86400, divisor: 3600, unit: 'jam' },
  { limit: 604800, divisor: 86400, unit: 'hari' },
] as const;

/**
 * "2 jam lalu", from a real timestamp.
 *
 * Deliberately coarse and never smaller than "baru saja": a notification list
 * is scanned, not read, and a second-accurate age invites a re-render loop for
 * no benefit. Past a week it falls back to the date, because "13 hari lalu"
 * stops helping anybody place the event.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 45) return 'baru saja';

  for (const { limit, divisor, unit } of RELATIVE) {
    if (seconds < limit) return `${Math.floor(seconds / divisor)} ${unit} lalu`;
  }

  return then.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  });
}
