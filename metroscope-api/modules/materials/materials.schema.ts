import { z } from 'zod';
import { queryBoolean } from '@/lib/http/query-boolean';

/**
 * Learning materials, request shapes (doc 06 §2.3, doc 13 §12.7, doc 14 §3.3).
 */

export const MATERIAL_KINDS = ['YOUTUBE', 'PDF', 'GDRIVE'] as const;

const slug = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung');

/**
 * A resource URL, validated per kind.
 *
 * A YouTube resource stores the VIDEO ID, not a watch URL, doc 06 says so, and
 * the portal embeds it. Accepting a full URL here would put
 * `https://youtube.com/watch?v=…` into an `<iframe src>` built from it and
 * render nothing, silently.
 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export const ResourceBody = z
  .object({
    kind: z.enum(MATERIAL_KINDS),
    title: z.string().min(2).max(200),
    url: z.string().min(2).max(1000),
    durationMin: z.coerce.number().int().min(1).max(600).nullable().optional(),
    orderIndex: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'YOUTUBE' && !YOUTUBE_ID.test(value.url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Isi ID video YouTube (11 karakter), bukan tautan lengkap.',
      });
    }
    if (value.kind !== 'YOUTUBE' && !/^https?:\/\//.test(value.url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Tautan harus diawali http(s)://' });
    }
    /** Only YouTube shows a duration; doc 06 marks the column YouTube-only. */
    if (value.kind !== 'YOUTUBE' && value.durationMin) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMin'],
        message: 'Durasi hanya untuk video YouTube.',
      });
    }
  });

export const CreateMaterialBody = z
  .object({
    title: z.string().min(2).max(200),
    slug: slug.optional(),
    topicId: z.string().uuid().nullable().optional(),
    description: z.string().max(4000).nullable().optional(),
    orderIndex: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const UpdateMaterialBody = z
  .object({
    title: z.string().min(2).max(200).optional(),
    slug: slug.optional(),
    topicId: z.string().uuid().nullable().optional(),
    description: z.string().max(4000).nullable().optional(),
    orderIndex: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

/**
 * Publish / unpublish / archive, the "publish state" doc 13 §12.7 asks for.
 *
 * A separate endpoint from the draft edit, for the same reason the CMS pipeline
 * separates them: changing what a module SAYS and changing who can SEE it are
 * different decisions, and one form that does both makes the second one an
 * accident.
 */
export const MaterialStatusBody = z
  .object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) })
  .strict();

/**
 * Exactly one scope, mirroring the CHECK constraint. Stated here too so the
 * caller gets a readable 422 rather than a constraint violation.
 */
export const AssignMaterialBody = z
  .object({
    studentId: z.string().uuid().optional(),
    programId: z.string().uuid().optional(),
    level: z.enum(['SD', 'SMP', 'SMA']).optional(),
  })
  .strict()
  .refine((v) => [v.studentId, v.programId, v.level].filter(Boolean).length === 1, {
    message: 'Pilih tepat satu sasaran: siswa, program, atau jenjang.',
  });

export const ListMaterialsQuery = z.object({
  /** Whose entitlement to resolve. Required for a guardian with more than one child. */
  studentId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  q: z.string().max(120).optional(),
  /** Staff only, and RLS decides regardless. This just widens the default. */
  includeDrafts: queryBoolean.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const ProgressBody = z
  .object({
    studentId: z.string().uuid(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']),
  })
  .strict();

export type ResourceInput = z.infer<typeof ResourceBody>;
export type CreateMaterialInput = z.infer<typeof CreateMaterialBody>;
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialBody>;
export type MaterialStatusInput = z.infer<typeof MaterialStatusBody>;
export type AssignMaterialInput = z.infer<typeof AssignMaterialBody>;
export type ListMaterialsInput = z.infer<typeof ListMaterialsQuery>;
export type ProgressInput = z.infer<typeof ProgressBody>;
