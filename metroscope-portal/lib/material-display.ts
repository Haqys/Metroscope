import type { MaterialKind, MaterialProgressStatus, MaterialStatus } from '@/lib/api';

/**
 * How a material reads on screen (doc 14 §3.3).
 *
 * A plain module with no `'use client'` directive, so server pages and client
 * components can both import it, §2.7's lesson: a constant exported from a
 * client module is `undefined` when a server component reads it.
 */

export const KIND_LABEL: Record<MaterialKind, string> = {
  YOUTUBE: 'Video',
  PDF: 'PDF',
  GDRIVE: 'Drive',
};

export const KIND_BADGE: Record<MaterialKind, string> = {
  YOUTUBE: 'bg-maroon-light text-maroon',
  PDF: 'bg-sky-100 text-sky-700',
  GDRIVE: 'bg-emerald-100 text-emerald-700',
};

export const STATUS_LABEL: Record<MaterialStatus, string> = {
  DRAFT: 'Draf',
  PUBLISHED: 'Terbit',
  ARCHIVED: 'Arsip',
};

export const STATUS_BADGE: Record<MaterialStatus, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-600',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-neutral-100 text-neutral-400',
};

export const PROGRESS_LABEL: Record<MaterialProgressStatus, string> = {
  NOT_STARTED: 'Belum Dibuka',
  IN_PROGRESS: 'Sedang Dipelajari',
  DONE: 'Selesai',
};

export const PROGRESS_BADGE: Record<MaterialProgressStatus, string> = {
  NOT_STARTED: 'bg-neutral-100 text-neutral-500',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
};

/**
 * Where a resource actually points.
 *
 * A YouTube resource stores the video ID, not a URL (doc 06), so the watch link
 * is built here rather than stored. One place that knows the shape, and no
 * chance of a stored `watch?v=` ending up in an `<iframe src>`.
 */
export function resourceHref(kind: MaterialKind, url: string): string {
  return kind === 'YOUTUBE' ? `https://www.youtube.com/watch?v=${url}` : url;
}

export const youtubeEmbed = (videoId: string) => `https://www.youtube.com/embed/${videoId}`;
