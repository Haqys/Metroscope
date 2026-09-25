'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, ExternalLink, FileText, FolderOpen, Youtube } from 'lucide-react';

import type { MaterialDetail as MaterialDetailRow, MaterialResource } from '@/lib/api';
import { setMaterialProgress } from '@/lib/material-actions';

const KIND_META: Record<
  MaterialResource['kind'],
  { label: string; icon: typeof Youtube; tint: string }
> = {
  YOUTUBE: { label: 'Video YouTube', icon: Youtube, tint: 'bg-red-50 text-red-600' },
  PDF: { label: 'Dokumen PDF', icon: FileText, tint: 'bg-navy-light text-navy' },
  GDRIVE: { label: 'Google Drive', icon: FolderOpen, tint: 'bg-amber-50 text-amber-600' },
};

function ResourceHeader({ resource }: { resource: MaterialResource }) {
  const meta = KIND_META[resource.kind];
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.tint}`}>
        <meta.icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
          {meta.label}
          {resource.durationMin ? ` · ${resource.durationMin} menit` : ''}
        </p>
        <p className="text-sm font-semibold text-neutral-900">{resource.title}</p>
      </div>
    </div>
  );
}

function ResourceBlock({ resource }: { resource: MaterialResource }) {
  if (resource.kind === 'YOUTUBE') {
    return (
      <section>
        <ResourceHeader resource={resource} />
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${resource.url}?rel=0`}
            title={resource.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </section>
    );
  }

  if (resource.kind === 'PDF') {
    return (
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <ResourceHeader resource={resource} />
          <div className="flex gap-2">
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer"
              className="hover:border-navy hover:text-navy flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Buka
            </a>
            <a
              href={resource.url}
              download
              className="hover:border-navy hover:text-navy flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh
            </a>
          </div>
        </div>
        <iframe
          src={resource.url}
          title={resource.title}
          className="h-[560px] w-full rounded-2xl border border-neutral-200"
        />
      </section>
    );
  }

  // Google Drive, shown as a prominent link (not embedded).
  return (
    <section>
      <ResourceHeader resource={resource} />
      <a
        href={resource.url}
        target="_blank"
        rel="noreferrer"
        className="hover:border-navy/40 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition-colors hover:bg-white"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50">
            <FolderOpen className="h-5 w-5 text-amber-600" />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">{resource.title}</p>
            <p className="text-xs text-neutral-400">Buka folder materi di Google Drive</p>
          </div>
        </div>
        <span className="bg-navy flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white">
          Buka Drive
          <ExternalLink className="h-4 w-4" />
        </span>
      </a>
    </section>
  );
}

/**
 * Material detail viewer, renders each resource by kind, and records what the
 * student did with it (doc 13 §12.7: "MaterialProgress written on open/complete").
 *
 * Opening counts. The effect below marks IN_PROGRESS once, on first view of a
 * module that has never been opened. That is what makes the mentor's
 * engagement roster meaningful, because "nobody opened it" and "nobody pressed
 * the button" are different findings and only the first is about teaching.
 *
 * It fires once per mount and never downgrades: a finished module stays
 * finished when a student comes back to re-read it.
 */
export function MaterialDetail({
  material,
  studentId,
}: {
  material: MaterialDetailRow;
  studentId: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState(material.progressStatus === 'DONE');
  const [busy, setBusy] = useState(false);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    if (material.progressStatus && material.progressStatus !== 'NOT_STARTED') return;
    marked.current = true;
    void setMaterialProgress(material.id, studentId, 'IN_PROGRESS');
  }, [material.id, material.progressStatus, studentId]);

  const complete = async () => {
    setBusy(true);
    const result = await setMaterialProgress(material.id, studentId, 'DONE');
    setBusy(false);
    if (result.ok) {
      setDone(true);
      router.refresh();
    }
  };

  return (
    <div>
      <p className="max-w-2xl text-sm leading-relaxed font-light text-neutral-500">
        {material.description}
      </p>

      <div className="mt-8 space-y-10">
        {material.resources.map((resource) => (
          <ResourceBlock key={resource.id} resource={resource} />
        ))}
      </div>

      {/* Mark complete (FR-MAT-3) */}
      <div className="mt-10 border-t border-neutral-200 pt-6">
        {done ? (
          <span className="flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-5 py-2.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Materi Selesai
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void complete()}
            className="bg-navy hover:bg-navy-dark flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            Tandai Selesai
          </button>
        )}
      </div>
    </div>
  );
}
