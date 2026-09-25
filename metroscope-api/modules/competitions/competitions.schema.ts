import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Competitions, request shapes (doc 13 §12.8, doc 14 §3.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Split three ways on purpose, mirroring the three authorities in
 * `97_competitions.sql`: the catalogue is edited through the CMS pipeline, the
 * roster through `student.edit`, and the outcome through `progress.edit`.
 * Nothing here lets one body write across that line, `TargetResultBody` cannot
 * name a student and `AddTargetBody` cannot carry a result.
 */

export const COMPETITION_LEVELS = [
  'SCHOOL',
  'REGIONAL',
  'PROVINCIAL',
  'NATIONAL',
  'INTERNATIONAL',
] as const;
export const COMPETITION_FORMATS = ['INDIVIDUAL', 'TEAM', 'BOTH'] as const;
export const COMPETITION_MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;
export const COMPETITION_RESULTS = [
  'PENDING',
  'WINNER',
  'FINALIST',
  'PARTICIPANT',
  'WITHDRAWN',
] as const;
export const SCHOOL_LEVELS = ['SD', 'SMP', 'SMA'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.');

/** A YYYY-MM-DD date or a full ISO instant; both become one `timestamptz`. */
const instant = z.coerce.date();

export const ListCompetitionsQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  level: z.enum(COMPETITION_LEVELS).optional(),
  /** Eligibility filter, the portal's SD / SMP / SMA tabs. */
  schoolLevel: z.enum(SCHOOL_LEVELS).optional(),
  /** Registration phase, derived from the clock (see `app.competition_phase`). */
  phase: z.enum(['OPEN', 'UPCOMING', 'CLOSED']).optional(),
  status: z
    .enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'])
    .optional(),
  /**
   * Restrict to competitions this student is entered in, the portal's
   * "Lomba Saya". Not a security boundary: RLS decides which targets exist for
   * the caller, so passing somebody else's id returns nothing rather than
   * somebody else's data.
   */
  studentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListCompetitionsInput = z.infer<typeof ListCompetitionsQuery>;

/**
 * Creating a competition needs only a name and a deadline.
 *
 * Everything else is editable afterwards through the pipeline's draft PATCH,
 * which is where the marketing copy belongs. A creation form that demanded the
 * venue and the fee before it would accept a row is how a Secretary ends up
 * keeping next season's lomba in a spreadsheet until "the details are ready".
 */
export const CreateCompetitionBody = z.object({
  name: z.string().trim().min(3).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka, dan tanda hubung.')
    .max(120)
    .optional(),
  registrationDeadline: instant,
  level: z.enum(COMPETITION_LEVELS).default('NATIONAL'),
  format: z.enum(COMPETITION_FORMATS).default('INDIVIDUAL'),
  mode: z.enum(COMPETITION_MODES).default('OFFLINE'),
  levels: z.array(z.enum(SCHOOL_LEVELS)).max(3).default([]),
});
export type CreateCompetitionInput = z.infer<typeof CreateCompetitionBody>;

/**
 * The draft body the CMS pipeline PATCHes.
 *
 * `.strict()` is what keeps `status`, `version` and `published_at` unreachable
 * from the editor even though they are columns on the same row, the registry's
 * `editableColumns` allowlist says the same thing a second time, deliberately.
 */
export const CompetitionDraftBody = z
  .object({
    name: z.string().trim().min(3).max(200),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka, dan tanda hubung.')
      .max(120),
    summary: z.string().trim().max(400).nullable(),
    description: z.string().trim().max(20000).nullable(),
    coverId: z.string().uuid().nullable(),
    organizer: z.string().trim().max(300).nullable(),
    venue: z.string().trim().max(300).nullable(),
    level: z.enum(COMPETITION_LEVELS),
    format: z.enum(COMPETITION_FORMATS),
    mode: z.enum(COMPETITION_MODES),
    categories: z.array(z.string().trim().min(1).max(60)).max(12),
    levels: z.array(z.enum(SCHOOL_LEVELS)).max(3),
    /** Integer IDR, never a float, per the money convention. */
    registrationFee: z.number().int().min(0).max(1_000_000_000).nullable(),
    feeNote: z.string().trim().max(300).nullable(),
    registrationUrl: z.string().url().max(500).nullable(),
    guidebookUrl: z.string().url().max(500).nullable(),
    registrationOpensAt: instant.nullable(),
    registrationDeadline: instant,
    eventStart: isoDate.nullable(),
    eventEnd: isoDate.nullable(),
    locale: z.string().min(2).max(8),
  })
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (value.eventStart && value.eventEnd && value.eventEnd < value.eventStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventEnd'],
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
      });
    }
    if (
      value.registrationOpensAt &&
      value.registrationDeadline &&
      value.registrationOpensAt > value.registrationDeadline
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationOpensAt'],
        message: 'Pendaftaran tidak bisa dibuka setelah batas akhirnya.',
      });
    }
  });

// ── roster (`student.edit`) ────────────────────────────────────────────

export const AddTargetBody = z.object({
  studentId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});
export type AddTargetInput = z.infer<typeof AddTargetBody>;

/**
 * Readiness and result (`progress.edit`).
 *
 * `studentId` is absent by construction: the target is identified by its own id
 * in the path, so this body cannot move an outcome onto a different child.
 */
export const UpdateTargetBody = z
  .object({
    readinessPct: z.number().int().min(0).max(100).optional(),
    result: z.enum(COMPETITION_RESULTS).optional(),
    award: z.string().trim().max(120).nullable().optional(),
    score: z.number().int().min(0).max(100000).nullable().optional(),
    certificateId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada yang diubah.',
  })
  .superRefine((value, ctx) => {
    /**
     * An award without a result is a half-recorded win: the achievement wall
     * and doc 13 §10.5's auto-draft both read `result`, so a row saying
     * "Juara 2" while still PENDING is invisible to every consumer that
     * matters, and looks recorded to the person who typed it.
     */
    if (value.award && value.result === 'PENDING') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: 'Pilih hasil lomba sebelum mengisi juara/medali.',
      });
    }
  });
export type UpdateTargetInput = z.infer<typeof UpdateTargetBody>;

// ── teams (`student.edit`) ─────────────────────────────────────────────

export const CreateTeamBody = z.object({
  name: z.string().trim().min(2).max(120),
  mentorId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamBody>;

export const AddTeamMemberBody = z.object({
  studentId: z.string().uuid(),
  role: z.enum(['LEADER', 'MEMBER']).default('MEMBER'),
});
export type AddTeamMemberInput = z.infer<typeof AddTeamMemberBody>;

export const PublicCompetitionsQuery = z.object({
  schoolLevel: z.enum(SCHOOL_LEVELS).optional(),
  level: z.enum(COMPETITION_LEVELS).optional(),
  /** Closed competitions are excluded unless explicitly asked for. */
  includeClosed: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PublicCompetitionsInput = z.infer<typeof PublicCompetitionsQuery>;
