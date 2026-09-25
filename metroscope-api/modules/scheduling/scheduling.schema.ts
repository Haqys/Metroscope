import { z } from 'zod';
import { queryBoolean } from '@/lib/http/query-boolean';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Scheduling, request shapes (doc 13 §12.6, doc 14 §3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const iso = z.string().datetime({ offset: true });

/** 0 = Sunday, matching Postgres `EXTRACT(DOW)` and JS `getDay()`. */
const weekday = z.coerce.number().int().min(0).max(6);

/** "16:00" or "16:00:00". Stored as `time`; rendered in WITA. */
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Format jam HH:MM');

export const SESSION_TYPES = ['CONSULTATION', 'LESSON', 'ASSESSMENT'] as const;

/**
 * `scope=mine` is what the mentor app asks for, and what `/schedule?scope=mine`
 * renders. It is a CONVENIENCE, not a permission: RLS already refuses rows a
 * caller may not read, so a mentor omitting it sees their own sessions anyway.
 * Being explicit is what lets the same page serve "the team's week" and "my
 * week" from one code path (doc 13 §7.2).
 */
export const ListSessionsQuery = z
  .object({
    from: iso.optional(),
    to: iso.optional(),
    scope: z.enum(['all', 'mine']).default('all'),
    studentId: z.string().uuid().optional(),
    mentorId: z.string().uuid().optional(),
    status: z.enum(['SCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW']).optional(),
    seriesId: z.string().uuid().optional(),
    /** Cancelled sessions are noise on a calendar and evidence in a dispute. */
    includeCancelled: queryBoolean.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Rentang tanggal terbalik.',
  });

export const CreateSessionBody = z
  .object({
    studentId: z.string().uuid(),
    mentorId: z.string().uuid(),
    programId: z.string().uuid().nullable().optional(),
    type: z.enum(SESSION_TYPES).default('LESSON'),
    startsAt: iso,
    /** Minutes, not an end instant, the form asks "berapa lama", not "sampai jam". */
    durationMin: z.coerce.number().int().min(15).max(480).default(90),
    meetUrl: z.string().url().max(500).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

/**
 * Edit ONE session. Everything optional; an omitted field is untouched.
 *
 * `status` is absent on purpose, moving a lesson and cancelling one are
 * different decisions with different consequences, and `/cancel` demands the
 * reason that makes the second one answerable later.
 */
export const UpdateSessionBody = z
  .object({
    mentorId: z.string().uuid().optional(),
    startsAt: iso.optional(),
    durationMin: z.coerce.number().int().min(15).max(480).optional(),
    type: z.enum(SESSION_TYPES).optional(),
    meetUrl: z.string().url().max(500).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

/** A cancellation without a reason is a mystery three weeks later. */
export const CancelSessionBody = z.object({ reason: z.string().min(3).max(500) }).strict();

export const MarkAttendanceBody = z
  .object({
    status: z.enum(['PRESENT', 'EXCUSED', 'ABSENT']),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

/**
 * A weekly rule. `weeks` is how far ahead to materialise sessions now, the
 * rest arrive when the rolling generator extends the horizon.
 */
export const CreateSeriesBody = z
  .object({
    studentId: z.string().uuid(),
    mentorId: z.string().uuid(),
    programId: z.string().uuid().nullable().optional(),
    weekday,
    startTime: clock,
    durationMin: z.coerce.number().int().min(15).max(480).default(90),
    startsOn: z.string().date(),
    endsOn: z.string().date().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    weeks: z.coerce.number().int().min(1).max(52).default(12),
  })
  .strict();

/**
 * Edit the SERIES, "edit all" in doc 06 §7.3's edit-one-vs-all.
 *
 * Only future sessions move. A rule change cannot rewrite a lesson that already
 * happened: the mentor was paid for it and the parent watched it.
 */
export const UpdateSeriesBody = z
  .object({
    mentorId: z.string().uuid().optional(),
    weekday: weekday.optional(),
    startTime: clock.optional(),
    durationMin: z.coerce.number().int().min(15).max(480).optional(),
    endsOn: z.string().date().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    weeks: z.coerce.number().int().min(1).max(52).default(12),
  })
  .strict();

export const EndSeriesBody = z
  .object({
    /** Sessions after this date are cancelled. Defaults to today. */
    effectiveFrom: z.string().date().optional(),
    reason: z.string().min(3).max(500),
  })
  .strict();

/** Pre-flight for the form: is this slot free, and is the mentor usually free? */
export const ConflictQuery = z.object({
  mentorId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  startsAt: iso,
  durationMin: z.coerce.number().int().min(15).max(480).default(90),
  /** The session being MOVED does not conflict with itself. */
  excludeId: z.string().uuid().optional(),
});

/**
 * The whole weekly template, replaced in one call.
 *
 * A PUT rather than per-slot CRUD: the editor is a week grid, the user thinks
 * in "this is my week", and a partial update would make "I removed Friday"
 * indistinguishable from "I did not mention Friday".
 */
export const SetAvailabilityBody = z
  .object({
    mentorId: z.string().uuid().optional(),
    slots: z.array(z.object({ weekday, startTime: clock, endTime: clock }).strict()).max(50),
  })
  .strict();

export type ListSessionsInput = z.infer<typeof ListSessionsQuery>;
export type CreateSessionInput = z.infer<typeof CreateSessionBody>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionBody>;
export type CancelSessionInput = z.infer<typeof CancelSessionBody>;
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceBody>;
export type CreateSeriesInput = z.infer<typeof CreateSeriesBody>;
export type UpdateSeriesInput = z.infer<typeof UpdateSeriesBody>;
export type EndSeriesInput = z.infer<typeof EndSeriesBody>;
export type ConflictInput = z.infer<typeof ConflictQuery>;
export type SetAvailabilityInput = z.infer<typeof SetAvailabilityBody>;
