import Link from 'next/link';
import { CheckCircle2, FileText, PlayCircle } from 'lucide-react';

import type { MaterialProgressStatus, MaterialRow } from '@/lib/api';
import { KIND_LABEL, PROGRESS_BADGE, PROGRESS_LABEL } from '@/lib/material-display';

const THUMB_STYLES: Record<MaterialProgressStatus, string> = {
  DONE: 'from-emerald-500 to-emerald-700',
  IN_PROGRESS: 'from-navy/90 to-navy-dark',
  NOT_STARTED: 'from-neutral-300 to-neutral-400',
};

/**
 * Study module card (FR-MAT-1/2/3).
 *
 * The fixture had a third status, `locked`, which rendered a padlock and an
 * unclickable card. Nothing ever locked a module: the fixture's own comment
 * called it "progress-gated" and no gate existed. Entitlement is the real gate
 * and it happens earlier, an unentitled module is not in this list at all, so
 * everything a family can see here is something they can open.
 */
export function ModuleCard({ material }: { material: MaterialRow }) {
  const status: MaterialProgressStatus = material.progressStatus ?? 'NOT_STARTED';

  return (
    <Link
      href={`/portal/materials/${material.slug}`}
      className="group block overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-md"
    >
      <div
        className={`relative flex aspect-video items-center justify-center bg-gradient-to-br ${THUMB_STYLES[status]}`}
      >
        {status === 'DONE' ? (
          <CheckCircle2 className="h-10 w-10 text-white/90" />
        ) : material.resourceCount > 0 ? (
          <PlayCircle className="h-10 w-10 text-white/90" />
        ) : (
          <FileText className="h-10 w-10 text-white/90" />
        )}
      </div>

      <div className="p-5">
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${PROGRESS_BADGE[status]}`}
        >
          {PROGRESS_LABEL[status]}
        </span>
        <h3 className="group-hover:text-navy mt-2.5 font-semibold text-neutral-900 transition-colors">
          {material.title}
        </h3>
        {material.topicName && (
          <p className="mt-1 text-xs text-neutral-400">{material.topicName}</p>
        )}
        {material.description && (
          <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{material.description}</p>
        )}
        <p className="mt-3 text-xs text-neutral-400">{material.resourceCount} sumber belajar</p>
      </div>
    </Link>
  );
}

/** Re-exported so the view can label a mixed list without importing twice. */
export { KIND_LABEL };
