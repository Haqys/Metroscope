'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2, Plus, Trash2, Users } from 'lucide-react';

import { SectionHeading } from '@/components/portal/section-heading';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import { Field, RadioGroup, Select } from '@/components/ui/field';
import {
  addResource,
  assignMaterial,
  createMaterial,
  fetchAssignments,
  removeResource,
  setMaterialStatus,
  unassignMaterial,
  type AssignmentRow,
} from '@/lib/material-actions';
import type { MaterialDetail, MaterialRow, StudentOption } from '@/lib/api';
import {
  KIND_BADGE,
  KIND_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  resourceHref,
} from '@/lib/material-display';
import { cn } from '@/lib/utils';

type Scope = 'STUDENT' | 'PROGRAM' | 'LEVEL';

const SCOPES = [
  { value: 'STUDENT' as const, label: 'Siswa tertentu', description: 'Satu anak saja' },
  { value: 'PROGRAM' as const, label: 'Satu program', description: 'Semua siswa program itu' },
  { value: 'LEVEL' as const, label: 'Jenjang', description: 'Semua siswa SD / SMP / SMA' },
];

const LEVELS = ['SD', 'SMP', 'SMA'];
const KINDS = [
  { value: 'YOUTUBE', label: 'Video YouTube' },
  { value: 'PDF', label: 'PDF' },
  { value: 'GDRIVE', label: 'Google Drive' },
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The material library (doc 13 §12.7, doc 14 §3.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This screen existed with a four-row fixture and a `TODO: wire to POST
 * /materials`. Its assignment dialog offered students from `students-data.ts`
 * and programmes from a string array, so it produced targets nothing could
 * resolve, doc 13 §12.7's "the entire learning-delivery promise is a mock".
 *
 * Three things it now does that the fixture could not:
 *
 * **A publish state.** A DRAFT module reaches no family, and one with no
 * resources cannot be published at all, the API refuses it, because a module
 * that opens to an empty page is exactly the half-finished thing the state
 * exists to keep out of the portal.
 *
 * **Entitlement at three scopes.** One student, a whole programme, or a whole
 * school level. A programme-scoped assignment reaches students through
 * `enrollments`, so a child who enrols next month gets the back catalogue with
 * nobody reassigning anything.
 *
 * **Engagement.** `assignmentCount` and `resourceCount` are counted by the API;
 * "who opened it" lives on the detail page, where the roster is.
 */
export function MaterialManager({
  materials,
  students,
  programs,
  detail,
}: {
  materials: MaterialRow[];
  students: StudentOption[];
  programs: { id: string; name: string }[];
  /** Loaded for the row being edited, so resources render without a round trip. */
  detail?: MaterialDetail;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState<MaterialRow | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [scope, setScope] = useState<Scope>('PROGRAM');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const [resourceFor, setResourceFor] = useState<MaterialRow | null>(null);
  const [kind, setKind] = useState('YOUTUBE');
  const [resTitle, setResTitle] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [duration, setDuration] = useState('');

  const field =
    'focus:border-navy focus:ring-navy/20 mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm';

  const submitCreate = async () => {
    if (title.trim().length < 2) return setError('Tulis judul modul.');
    setBusy(true);
    setError(null);
    const result = await createMaterial({ title: title.trim() });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal membuat modul.');
    setCreating(false);
    setTitle('');
    router.refresh();
  };

  const submitResource = async () => {
    if (!resourceFor) return;
    setBusy(true);
    setError(null);
    const result = await addResource(resourceFor.id, {
      kind,
      title: resTitle.trim(),
      url: resUrl.trim(),
      durationMin: kind === 'YOUTUBE' && duration ? Number(duration) : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal menambah sumber.');
    setResourceFor(null);
    setResTitle('');
    setResUrl('');
    setDuration('');
    router.refresh();
  };

  const submitAssign = async () => {
    if (!assigning) return;
    if (!target) return setError('Pilih sasaran.');
    setBusy(true);
    setError(null);
    const body =
      scope === 'STUDENT'
        ? { studentId: target }
        : scope === 'PROGRAM'
          ? { programId: target }
          : { level: target };
    const result = await assignMaterial(assigning.id, body);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal memberikan materi.');
    setAssigning(null);
    setTarget('');
    router.refresh();
  };

  const changeStatus = async (id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => {
    setBusy(true);
    setError(null);
    const result = await setMaterialStatus(id, status);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Gagal mengubah status.');
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading
          title="Perpustakaan Modul"
          subtitle="Modul, sumber belajar, dan siapa yang bisa mengaksesnya"
        />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-navy inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Modul Baru
        </button>
      </div>

      {error && (
        <p className="border-maroon/30 bg-maroon-light/40 text-maroon mt-4 rounded-xl border p-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-6">
        {materials.length === 0 ? (
          <EmptyState
            title="Belum ada modul"
            description="Buat modul pertama, tambahkan sumber belajar, lalu terbitkan."
          />
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
            {materials.map((material) => (
              <li key={material.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">{material.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {material.topicName ?? 'Tanpa topik'} · {material.resourceCount} sumber ·{' '}
                      {material.assignmentCount} pemberian
                    </p>
                    {detail?.id === material.id && detail.resources.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {detail.resources.map((resource) => (
                          <li key={resource.id} className="flex items-center gap-2 text-xs">
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                KIND_BADGE[resource.kind],
                              )}
                            >
                              {KIND_LABEL[resource.kind]}
                            </span>
                            <a
                              href={resourceHref(resource.kind, resource.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-navy truncate hover:underline"
                            >
                              {resource.title}
                            </a>
                            {resource.durationMin && (
                              <span className="text-neutral-400">{resource.durationMin} menit</span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                void removeResource(material.id, resource.id).then(() =>
                                  router.refresh(),
                                )
                              }
                              aria-label={`Hapus ${resource.title}`}
                              className="text-maroon ml-auto"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        STATUS_BADGE[material.status],
                      )}
                    >
                      {STATUS_LABEL[material.status]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setResourceFor(material)}
                      className="text-navy inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Sumber
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssigning(material);
                        setTarget('');
                        setError(null);
                        setAssignments([]);
                        void fetchAssignments(material.id).then((r) =>
                          setAssignments(r.data?.items ?? []),
                        );
                      }}
                      className="text-navy inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Berikan
                    </button>
                    {material.status === 'PUBLISHED' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(material.id, 'DRAFT')}
                        className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Tarik
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(material.id, 'PUBLISHED')}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Terbitkan
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New module */}
      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modul Baru</DialogTitle>
          </DialogHeader>
          <Field label="Judul modul" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Modul 1: Aljabar Dasar"
              className={field}
            />
          </Field>
          <p className="mt-2 text-xs text-neutral-500">
            Modul dibuat sebagai draf. Tambahkan sumber belajar dulu, modul kosong tidak bisa
            diterbitkan.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitCreate()}
            className="bg-navy mt-4 inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Buat modul
          </button>
        </DialogContent>
      </Dialog>

      {/* Add a resource */}
      <Dialog open={resourceFor !== null} onOpenChange={(open) => !open && setResourceFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Sumber Belajar</DialogTitle>
          </DialogHeader>
          <Field label="Jenis" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Judul" required>
            <input
              value={resTitle}
              onChange={(e) => setResTitle(e.target.value)}
              className={field}
            />
          </Field>
          <Field
            label={kind === 'YOUTUBE' ? 'ID video YouTube' : 'Tautan'}
            required
            description={
              kind === 'YOUTUBE'
                ? 'Bagian setelah v=, 11 karakter, bukan tautan lengkap.'
                : 'Diawali https://'
            }
          >
            <input value={resUrl} onChange={(e) => setResUrl(e.target.value)} className={field} />
          </Field>
          {kind === 'YOUTUBE' && (
            <Field label="Durasi (menit)">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={field}
              />
            </Field>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitResource()}
            className="bg-navy mt-4 inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Tambah
          </button>
        </DialogContent>
      </Dialog>

      {/* Assign */}
      <Dialog open={assigning !== null} onOpenChange={(open) => !open && setAssigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Berikan &ldquo;{assigning?.title}&rdquo;</DialogTitle>
          </DialogHeader>
          {assignments.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-neutral-700">Sudah diberikan ke</p>
              <ul className="mt-1.5 space-y-1">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-xs text-neutral-600">
                    <span>{a.studentName ?? a.programName ?? `Jenjang ${a.level}`}</span>
                    <button
                      type="button"
                      aria-label="Cabut pemberian"
                      onClick={() =>
                        void unassignMaterial(assigning!.id, a.id).then((r) => {
                          if (r.ok) {
                            setAssignments((prev) => prev.filter((x) => x.id !== a.id));
                            router.refresh();
                          }
                        })
                      }
                      className="text-maroon ml-auto font-semibold hover:underline"
                    >
                      Cabut
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Field label="Sasaran" required>
            <RadioGroup
              options={SCOPES}
              value={scope}
              onChange={(next) => {
                setScope(next);
                setTarget('');
              }}
              label="Sasaran"
            />
          </Field>
          <div className="mt-4">
            <Field label="Pilih" required>
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Pilih…</option>
                {scope === 'STUDENT' &&
                  students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.level ? `, ${s.level}` : ''}
                    </option>
                  ))}
                {scope === 'PROGRAM' &&
                  programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                {scope === 'LEVEL' &&
                  LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Pemberian per program mengikuti pendaftaran: siswa yang bergabung bulan depan otomatis
            ikut mendapatkannya.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitAssign()}
            className="bg-navy mt-4 inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Berikan
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
