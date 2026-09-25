'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Phone, PhoneCall } from 'lucide-react';

import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Textarea } from '@/components/ui/field';
import type { LeadRow } from '@/lib/api';
import { logContact } from '@/lib/leads-actions';
import { timeAgo } from '@/lib/leads-display';

/**
 * Follow-up queue (FR-CNF-6): log a contact attempt and set the next touch.
 *
 * Writes through `POST /v1/registrations/:id/contact`. The contact log is
 * append-only in the database, no UPDATE or DELETE policy exists, because it
 * is what the follow-up queue reads and what any later dispute relies on, and a
 * log you can rewrite is not evidence of anything.
 */
export function FollowUpTable({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const [contacting, setContacting] = useState<LeadRow | null>(null);
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setContacting(null);
    setNote('');
    setFollowUpAt(undefined);
    setError(null);
  };

  const submit = async () => {
    if (!contacting) return;
    if (note.trim().length < 3) {
      setError('Tulis singkat apa hasil kontaknya.');
      return;
    }

    setSaving(true);
    const result = await logContact(contacting.id, note.trim(), followUpAt);
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'Gagal menyimpan.');
      return;
    }
    close();
    // Re-fetch on the server so the queue reflects the new follow-up date.
    router.refresh();
  };

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
          <p className="truncate text-neutral-800">{row.original.parentName ?? '-'}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-400">{row.original.parentPhone}</p>
        </div>
      ),
    },
    {
      accessorKey: 'programName',
      header: 'Program Diminta',
      cell: ({ row }) => row.original.programName ?? '-',
    },
    {
      accessorKey: 'followUpAt',
      header: 'Jadwal Follow Up',
      cell: ({ row }) => {
        const at = row.original.followUpAt;
        if (!at) return <span className="text-xs text-neutral-400">belum dijadwalkan</span>;
        const overdue = new Date(at).getTime() < Date.now();
        return (
          <span
            className={`text-xs whitespace-nowrap ${overdue ? 'text-maroon font-semibold' : 'text-neutral-500'}`}
          >
            {timeAgo(at)}
          </span>
        );
      },
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Terakhir Dihubungi',
      cell: ({ getValue }) => (
        <span className="text-xs whitespace-nowrap text-neutral-500">
          {timeAgo(getValue<string | null>())}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Aksi',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setContacting(row.original);
            }}
            className="hover:border-navy/40 hover:text-navy flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-neutral-600 transition-colors"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Catat Kontak
          </button>
          <a
            href={`tel:${row.original.parentPhone.replace(/\D/g, '')}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-full border border-emerald-600/40 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white"
          >
            <Phone className="h-3.5 w-3.5" />
            Telepon
          </a>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        minWidth={1040}
        onRowClick={(r) => router.push(`/leads/${r.id}`)}
        emptyMessage="Tidak ada lead yang perlu di-follow up 🎉"
      />

      <Dialog open={!!contacting} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Kontak, {contacting?.childName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Hasil kontak" required error={error ?? undefined}>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Mis. ditelepon, orang tua minta info biaya dulu…"
                invalid={!!error}
              />
            </Field>

            <Field
              label="Follow up berikutnya"
              hint="Kosongkan kalau belum perlu dijadwalkan ulang."
            >
              <DatePicker
                value={followUpAt}
                onChange={setFollowUpAt}
                minDate={new Date()}
                placeholder="Pilih tanggal"
              />
            </Field>

            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="bg-navy hover:bg-navy-dark w-full rounded-full py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
