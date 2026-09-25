import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  FileStack,
  Receipt,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import type { InboxItem, InboxType } from '@/lib/api';

const formatIdr = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const TYPE_STYLE: Record<InboxType, { icon: LucideIcon; label: string; tone: string }> = {
  registration: { icon: UserPlus, label: 'Pendaftar', tone: 'bg-sky-50 text-sky-700' },
  payment_proof: { icon: Receipt, label: 'Bukti transfer', tone: 'bg-emerald-50 text-emerald-700' },
  overdue: { icon: AlertCircle, label: 'Lewat tempo', tone: 'bg-maroon-light/60 text-maroon' },
  billing_run: { icon: FileStack, label: 'Penerbitan', tone: 'bg-amber-50 text-amber-700' },
  content: { icon: FileStack, label: 'Konten', tone: 'bg-violet-50 text-violet-700' },
  reschedule: { icon: CalendarClock, label: 'Reschedule', tone: 'bg-neutral-100 text-neutral-600' },
  unassessed: { icon: FileStack, label: 'Belum dinilai', tone: 'bg-neutral-100 text-neutral-600' },
};

/**
 * How long this has been waiting, in words.
 *
 * Rendered from the server-supplied timestamp on every request rather than
 * ticking in the browser: the page is a server component, and a live counter
 * would buy nothing on a queue people look at, act on, and leave.
 */
function ageOf(since: string): { label: string; urgency: 'calm' | 'warn' | 'late' } {
  const ms = Date.now() - new Date(since).getTime();
  const hours = Math.floor(ms / 3_600_000);

  if (hours < 1) return { label: 'baru saja', urgency: 'calm' };
  if (hours < 24) return { label: `${hours} jam`, urgency: hours >= 12 ? 'warn' : 'calm' };

  const days = Math.floor(hours / 24);
  return { label: `${days} hari`, urgency: 'late' };
}

const URGENCY_CLASS = {
  calm: 'text-neutral-400',
  warn: 'text-amber-600',
  late: 'text-maroon font-semibold',
} as const;

/**
 * One row per pending decision, whatever produced it.
 *
 * Every row states its age, because the failure mode this page exists to fix is
 * not "nobody can find the work". It is "the work nobody remembered". Twelve
 * hours turns the age amber, twenty-four turns it red.
 */
export function InboxQueue({ items }: { items: InboxItem[] }) {
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
      {items.map((item) => {
        const style = TYPE_STYLE[item.type];
        const age = ageOf(item.waitingSince);
        const Icon = style.icon;

        return (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.tone}`}
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-neutral-900">
                    {item.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.tone}`}
                  >
                    {style.label}
                  </span>
                </span>
                {item.subtitle && (
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">
                    {item.subtitle}
                  </span>
                )}
              </span>

              {item.amount !== null && (
                <span className="hidden shrink-0 text-sm font-semibold text-neutral-900 sm:block">
                  {formatIdr(item.amount)}
                </span>
              )}

              <span className={`shrink-0 text-xs ${URGENCY_CLASS[age.urgency]}`}>{age.label}</span>

              <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
