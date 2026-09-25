import type { Metadata } from 'next';

import { NotificationList } from '@/components/portal/notification-list';
import { PageHeader } from '@/components/portal/page-header';
import { listNotifications } from '@/lib/api';

export const metadata: Metadata = { title: 'Notifikasi' };

/**
 * Portal, the notification archive.
 *
 * The bell in the topbar only ever showed a dropdown of five invented items;
 * real `notifications` rows had nowhere to live afterwards (doc 13 §6.1). This
 * is that archive, and it is now the same rows the bell reads.
 *
 * What it shows is what was actually delivered: `GET /v1/me/notifications`
 * returns IN_APP rows plus EMAIL rows whose status is SENT. A PENDING claim or
 * a FAILED attempt is the dispatcher's bookkeeping, and telling a parent about
 * a message they never received would be worse than saying nothing.
 */
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const { items, unread } = await listNotifications({ limit: 50 });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifikasi"
        subtitle="Semua pemberitahuan tentang jadwal, tagihan, dan assessment."
      />

      <div className="mt-8">
        <NotificationList initialItems={items} initialUnread={unread} />
      </div>
    </div>
  );
}
