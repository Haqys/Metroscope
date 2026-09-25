'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';

import { presentationFor, relativeTime } from '@/lib/notification-display';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/me-actions';
import type { NotificationItem } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Topbar notification centre (FR-NTF-1/2), reading real rows.
 *
 * It used to hold five invented notifications, "Invoice Agustus 2026 telah
 * terbit", "les rutin besok pukul 10.00 bersama Kak Dinda", complete with an
 * unread badge of 3. Every account saw the same three, none of them referred
 * to anything, and clicking one navigated to a page that disagreed with it.
 *
 * A client component, so it cannot read the HttpOnly cookie itself; it goes
 * through `/api/bff/me/notifications`, which attaches the token server-side.
 * Fetched on mount and again when the dropdown opens rather than polled: a
 * bell that polls every thirty seconds costs a request per user per thirty
 * seconds to change nothing, and the archive page is one click away.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetchNotifications(10);
    if (res.ok && res.data) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Refresh on open, so a notification that arrived since mount is there. */
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    const before = items;
    const stamp = new Date().toISOString();
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? stamp })));
    setUnread(0);
    const res = await markAllNotificationsRead();
    if (!res.ok) {
      setItems(before);
      setUnread(before.filter((n) => !n.readAt).length);
    }
  };

  const markRead = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target || target.readAt) return;
    const stamp = new Date().toISOString();
    setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: stamp } : n)));
    setUnread((n) => Math.max(0, n - 1));
    const res = await markNotificationRead(id);
    if (!res.ok) {
      setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: null } : n)));
      setUnread((n) => n + 1);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="bg-maroon absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-12 right-0 z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">
              Notifikasi{unread > 0 ? ` (${unread})` : ''}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-navy flex items-center gap-1 text-xs font-medium hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tandai semua dibaca
              </button>
            )}
          </div>

          {!loaded ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">Belum ada notifikasi.</p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
              {items.map((n) => {
                const { icon: Icon, tint } = presentationFor(n.category);
                const isUnread = !n.readAt;
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex gap-3 border-b border-neutral-50 px-4 py-3 transition-colors last:border-0 hover:bg-neutral-50',
                        isUnread && 'bg-navy-light/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          tint,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'text-sm leading-snug',
                            isUnread ? 'font-medium text-neutral-900' : 'text-neutral-600',
                          )}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-400">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                      {isUnread && (
                        <span
                          className="bg-maroon mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          aria-hidden
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/portal/notifications"
            onClick={() => setOpen(false)}
            className="text-navy block border-t border-neutral-100 px-4 py-3 text-center text-xs font-medium hover:bg-neutral-50"
          >
            Lihat semua notifikasi
          </Link>
        </div>
      )}
    </div>
  );
}
