'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCheck } from 'lucide-react';

import { presentationFor, relativeTime } from '@/lib/notification-display';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/me-actions';
import type { NotificationItem } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * The notification archive (FR-NTF-1/2).
 *
 * Seeded by the server page and then owned by the browser, so marking one read
 * does not cost a full navigation. The optimistic update is safe to keep on a
 * failure path that reverts: `read_at` is `COALESCE(read_at, now())` on the
 * API side, so marking twice is not an error and a lost response is not a lost
 * state, the next page load re-reads the truth either way.
 */
export function NotificationList({
  initialItems,
  initialUnread,
}: {
  initialItems: NotificationItem[];
  initialUnread: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);

  const markOne = async (id: string) => {
    const target = items.find((i) => i.id === id);
    if (!target || target.readAt) return;

    const stamp = new Date().toISOString();
    setItems((list) => list.map((i) => (i.id === id ? { ...i, readAt: stamp } : i)));
    setUnread((n) => Math.max(0, n - 1));

    const res = await markNotificationRead(id);
    if (!res.ok) {
      setItems((list) => list.map((i) => (i.id === id ? { ...i, readAt: null } : i)));
      setUnread((n) => n + 1);
    }
  };

  const markAll = async () => {
    setBusy(true);
    const before = items;
    const stamp = new Date().toISOString();
    setItems((list) => list.map((i) => ({ ...i, readAt: i.readAt ?? stamp })));
    setUnread(0);

    const res = await markAllNotificationsRead();
    if (!res.ok) {
      setItems(before);
      setUnread(before.filter((i) => !i.readAt).length);
    }
    setBusy(false);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
        <p className="text-sm font-semibold text-neutral-900">Belum ada notifikasi</p>
        <p className="mt-1 text-sm text-neutral-500">
          Pemberitahuan tentang tagihan baru, pengingat les, keputusan reschedule, dan hasil
          assessment akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3.5">
        <p className="text-sm font-semibold text-neutral-900">
          {unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
        </p>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            disabled={busy}
            className="text-navy flex items-center gap-1.5 text-xs font-medium transition-opacity hover:underline disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Tandai semua dibaca
          </button>
        )}
      </div>

      <ul>
        {items.map((n) => {
          const { icon: Icon, tint } = presentationFor(n.category);
          const isUnread = !n.readAt;
          return (
            <li key={n.id}>
              <Link
                href={n.href}
                onClick={() => void markOne(n.id)}
                className={cn(
                  'flex gap-4 border-b border-neutral-50 px-5 py-4 transition-colors last:border-0 hover:bg-neutral-50',
                  isUnread && 'bg-navy-light/40',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    tint,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm leading-snug',
                      isUnread ? 'font-medium text-neutral-900' : 'text-neutral-600',
                    )}
                  >
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">{relativeTime(n.createdAt)}</p>
                </div>
                {isUnread && (
                  <span className="bg-maroon mt-2 h-2 w-2 shrink-0 rounded-full" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
