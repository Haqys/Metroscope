'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';

import { SegmentedTabs } from '@/components/portal/segmented-tabs';

import { FollowUpTable } from './follow-up-table';
import { DataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import type { LeadRow, LeadStatus } from '@/lib/api';
import {
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  LEAD_TYPE_LABEL,
  timeAgo,
} from '@/lib/leads-display';

const columns: ColumnDef<LeadRow>[] = [
  {
    accessorKey: 'childName',
    header: 'Nama Anak',
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-neutral-900">{row.original.childName}</p>
        <p className="mt-0.5 truncate text-xs text-neutral-400">{row.original.level}</p>
      </div>
    ),
  },
  {
    accessorKey: 'parentName',
    header: 'Orang Tua',
    cell: ({ row }) => (
      <div className="min-w-0">
        {/* A lead can arrive without a parent name, the public form only
            requires the child's. Showing an em dash beats showing "null". */}
        <p className="truncate text-neutral-800">{row.original.parentName ?? '-'}</p>
        <p className="mt-0.5 truncate text-xs text-neutral-400">{row.original.parentPhone}</p>
      </div>
    ),
  },
  {
    accessorKey: 'programName',
    header: 'Program',
    cell: ({ row }) => row.original.programName ?? '-',
  },
  {
    accessorKey: 'type',
    header: 'Jalur',
    cell: ({ row }) => (
      <span
        className={cn(
          'rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1',
          row.original.type === 'DIRECT'
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70'
            : 'bg-sky-50 text-sky-700 ring-sky-200/70',
        )}
      >
        {LEAD_TYPE_LABEL[row.original.type]}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap',
          LEAD_STATUS_BADGE[row.original.status],
        )}
      >
        {LEAD_STATUS_LABEL[row.original.status]}
      </span>
    ),
  },
  {
    accessorKey: 'source',
    header: 'Sumber',
    cell: ({ getValue }) => (
      <span className="text-xs whitespace-nowrap text-neutral-500">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Masuk',
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-neutral-500">{timeAgo(getValue<string>())}</span>
    ),
  },
];

const TABS = ['Menunggu', 'Konsultasi', 'Follow Up', 'Jadi Siswa', 'Semua'] as const;
type Tab = (typeof TABS)[number];

const TAB_COUNT_KEY: Record<Tab, LeadStatus | null> = {
  Menunggu: 'NEW',
  Konsultasi: 'CONSULTING',
  'Follow Up': 'NURTURING',
  'Jadi Siswa': 'CONVERTED',
  Semua: null,
};

/**
 * The lead pipeline. One page, status as a filter (doc 13 §4.3).
 *
 * Filtering happens in the URL, not in local state: the server fetches only the
 * active tab, so this never holds rows the user cannot see, and a Secretary can
 * bookmark or share "everything waiting".
 *
 * The Follow Up tab swaps in a different table because that queue does different
 * work. It logs contact attempts rather than deciding.
 */
export function RegistrationTable({
  rows,
  counts,
  activeTab,
  query,
}: {
  rows: LeadRow[];
  counts: Partial<Record<LeadStatus, number>>;
  activeTab: string;
  query: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query);

  const tab = (TABS as readonly string[]).includes(activeTab) ? (activeTab as Tab) : 'Menunggu';

  const navigate = (next: { tab?: string; q?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.push(`/leads?${params.toString()}`));
  };

  const waiting = counts.NEW ?? 0;

  return (
    <div>
      <SegmentedTabs
        tabs={TABS}
        value={tab}
        onChange={(t) => navigate({ tab: t, q: search || undefined })}
        label="Filter pendaftar"
        aside={
          <p className="text-xs text-neutral-400">
            {waiting} pendaftar menunggu review
            {pending && ' · memuat…'}
          </p>
        }
      />

      <form
        className="relative mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ tab, q: search || undefined });
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama anak, orang tua, atau nomor telepon…"
          aria-label="Cari pendaftar"
          className="focus:border-navy focus:ring-navy/15 w-full rounded-full border border-neutral-200 bg-white py-2.5 pr-4 pl-10 text-sm text-neutral-800 placeholder:text-neutral-400 focus:ring-2 focus:outline-none"
        />
      </form>

      <div className="mt-5">
        {tab === 'Follow Up' ? (
          <FollowUpTable rows={rows} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            minWidth={980}
            onRowClick={(r) => router.push(`/leads/${r.id}`)}
            emptyMessage={
              query
                ? `Tidak ada pendaftar yang cocok dengan "${query}".`
                : `Tidak ada pendaftar berstatus ${LEAD_STATUS_LABEL[TAB_COUNT_KEY[tab] ?? 'NEW']}.`
            }
          />
        )}
      </div>
    </div>
  );
}
