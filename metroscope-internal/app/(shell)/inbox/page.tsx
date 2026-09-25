import type { Metadata } from 'next';
import Link from 'next/link';

import { InboxQueue } from '@/components/internal/inbox-queue';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/ui/states';
import { inboxCounts, listInbox, type InboxType } from '@/lib/api';

export const metadata: Metadata = { title: 'Kotak Masuk' };
export const dynamic = 'force-dynamic';

const TYPES: { value: InboxType; label: string }[] = [
  { value: 'registration', label: 'Pendaftar' },
  { value: 'payment_proof', label: 'Bukti Transfer' },
  { value: 'overdue', label: 'Lewat Tempo' },
  { value: 'billing_run', label: 'Penerbitan' },
];

const isType = (v: string | undefined): v is InboxType => !!v && TYPES.some((t) => t.value === v);

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

/**
 * Kotak Masuk. One queue for every decision waiting on a human (doc 13 §7.2).
 *
 * The queue is deliberately not grouped by type. Grouping would restore exactly
 * what this page replaces: six separate lists that each have to be checked, and
 * a decision that has waited four days sitting politely below one raised four
 * minutes ago because it happens to be a different kind of work. Oldest first,
 * one list, age on every row.
 *
 * Nothing is filtered here. The API returns only what the caller's grants and
 * RLS allow, so a Secretary's queue and Finance's queue are different lists
 * from the same endpoint.
 */
export default async function InboxPage({ searchParams }: PageProps) {
  const { type } = await searchParams;
  const active = isType(type) ? type : undefined;

  const [queue, counts] = await Promise.all([
    listInbox({ type: active, limit: 50 }),
    inboxCounts(),
  ]);

  const shown = queue.items.length;
  const total = active ? counts.byType[active] : counts.total;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Kotak Masuk"
        subtitle="Semua keputusan yang menunggu, dalam satu antrean."
      />

      {/* Tabs are links so the page stays a server component. */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/inbox"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            active ? 'text-neutral-500 hover:bg-neutral-100' : 'bg-navy text-white'
          }`}
        >
          Semua
          {counts.total > 0 && <Badge value={counts.total} active={!active} />}
        </Link>

        {/*
          A type with nothing in it is hidden rather than shown as a zero. A
          Secretary has no use for a permanently empty "Bukti Transfer" tab, and
          the set of tabs then doubles as an honest statement of what this
          account is responsible for.
        */}
        {TYPES.filter((t) => counts.byType[t.value] > 0).map((t) => (
          <Link
            key={t.value}
            href={`/inbox?type=${t.value}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              active === t.value ? 'bg-navy text-white' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            {t.label}
            <Badge value={counts.byType[t.value]} active={active === t.value} />
          </Link>
        ))}
      </div>

      <div className="mt-6">
        {queue.items.length === 0 ? (
          <EmptyState
            title={active ? 'Tidak ada yang menunggu di kategori ini' : 'Semua sudah beres'}
            description={
              active
                ? 'Coba lihat kategori lain, atau buka semua antrean.'
                : 'Tidak ada keputusan yang menunggumu saat ini. Item baru muncul di sini begitu masuk.'
            }
          />
        ) : (
          <>
            <InboxQueue items={queue.items} />
            {shown < total && (
              <p className="mt-4 rounded-xl bg-neutral-50/70 p-3 text-center text-xs text-neutral-500">
                Menampilkan {shown} dari {total} item, yang paling lama menunggu lebih dulu.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        active ? 'bg-white/20 text-white' : 'bg-neutral-200/70 text-neutral-600'
      }`}
    >
      {value}
    </span>
  );
}
