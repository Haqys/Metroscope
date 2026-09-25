import { z } from 'zod';
import { queryBoolean } from '@/lib/http/query-boolean';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Media library (doc 13 §9.7, doc 14 §2.2).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nothing in this module knows what a media asset will be used FOR. That is the
 * point: articles, pages and programmes consume it in later tasks, and none of
 * them appears in this file, in the service, or in the tables.
 */

/**
 * What the bucket will accept.
 *
 * An allowlist, not a blocklist. The bucket is PUBLIC and served to the open
 * web, so anything uploadable is something a visitor's browser will execute or
 * render, `image/svg+xml` is deliberately absent, because an SVG is a document
 * that can carry script and would be served from our own origin.
 */
export const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'application/pdf',
] as const;

/** 10 MB. Above this an editor should be compressing, not uploading. */
export const MAX_BYTES = 10 * 1024 * 1024;

export const RequestUpload = z
  .object({
    filename: z.string().min(1).max(255),
    mimeType: z.enum(ALLOWED_MIME, {
      message: `Tipe file tidak didukung. Gunakan: ${ALLOWED_MIME.join(', ')}`,
    }),
    sizeBytes: z
      .number()
      .int()
      .min(1, 'File kosong.')
      .max(MAX_BYTES, `Maksimal ${MAX_BYTES / 1024 / 1024} MB.`),
    title: z.string().min(1).max(200).optional(),
    folder: z
      .string()
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-/]*$/, 'Folder hanya huruf kecil, angka, - dan /')
      .optional(),
    /** Content hash from the browser. Used for dedupe only, never trusted. */
    checksum: z.string().max(128).optional(),
  })
  .strict();

export const ConfirmUpload = z
  .object({
    /** Intrinsic pixels, read by the browser. Absent for PDFs. */
    width: z.number().int().min(1).max(30000).optional(),
    height: z.number().int().min(1).max(30000).optional(),
  })
  .strict();

export const UpdateMedia = z
  .object({
    alt: z.string().max(300).nullable().optional(),
    caption: z.string().max(500).nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    folder: z
      .string()
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-/]*$/)
      .nullable()
      .optional(),
    focalX: z.number().min(0).max(1).optional(),
    focalY: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

export const ListMediaQuery = z
  .object({
    /** Free text over title, alt and filename. */
    q: z.string().max(120).optional(),
    folder: z.string().max(80).optional(),
    /** `image` / `pdf`, matched against the mime prefix. */
    kind: z.enum(['image', 'pdf']).optional(),
    /** Assets missing alt text, the accessibility backlog, as a filter. */
    missingAlt: queryBoolean.optional(),
    /** Show the recycle bin instead of the library. */
    deleted: queryBoolean.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(60),
  })
  .strict();

export const DeleteMediaQuery = z
  .object({
    /**
     * Delete anyway, despite recorded usage. Never the default: the whole
     * point of the usage map is that somebody sees the list first.
     */
    force: queryBoolean.optional(),
  })
  .strict();

export type RequestUploadInput = z.infer<typeof RequestUpload>;
export type ConfirmUploadInput = z.infer<typeof ConfirmUpload>;
export type UpdateMediaInput = z.infer<typeof UpdateMedia>;
export type ListMediaQueryInput = z.infer<typeof ListMediaQuery>;
export type DeleteMediaQueryInput = z.infer<typeof DeleteMediaQuery>;

export interface MediaAsset {
  id: string;
  url: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
  title: string;
  folder: string | null;
  focalX: number;
  focalY: number;
  status: 'PENDING' | 'READY';
  /**
   * Safe to place in published content.
   *
   * Derived, never stored: an image without alt text fails the accessibility
   * gate doc 13 §9.7 asks for, and a stored flag would need updating every time
   * the alt changed.
   */
  isReady: boolean;
  usageCount: number;
  uploadedByName: string | null;
  createdAt: string;
  deletedAt: string | null;
}
