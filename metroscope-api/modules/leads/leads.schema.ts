import { z } from 'zod';

/**
 * Contract for the leads module.
 *
 * Every object is strict: an unknown key is a client bug or an attack, never
 * something to silently drop.
 */
export const ListLeadsQuery = z
  .object({
    status: z.enum(['NEW', 'CONSULTING', 'NURTURING', 'CONVERTED', 'REJECTED', 'LOST']).optional(),
    source: z.string().max(64).optional(),
    /** Free-text over child name, parent name and phone. */
    q: z.string().max(120).optional(),
    /** Follow-up queue: only leads whose next touch is due at or before this. */
    dueBefore: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    /** Keyset cursor, the id of the last row on the previous page. */
    cursor: z.string().uuid().optional(),
  })
  .strict();

export const CreateLead = z
  .object({
    childName: z.string().min(2).max(120),
    parentPhone: z.string().regex(/^[0-9+\-\s]{8,20}$/),
    /**
     * REQUIRED, not optional.
     *
     * Email is the only outbound channel (doc 08 §4. WhatsApp was removed),
     * and conversion refuses a lead without one (`PARENT_EMAIL_REQUIRED`). A
     * public submission with no address therefore creates a lead nobody can
     * contact and nobody can convert: it enters the funnel and can only ever
     * leave it as LOST.
     */
    parentEmail: z.string().email(),
    parentName: z.string().max(120).optional(),
    school: z.string().max(160).optional(),
    /** ISO date from the form's `<input type="date">`. */
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal lahir harus YYYY-MM-DD')
      .optional(),
    level: z.enum(['SD', 'SMP', 'SMA']),
    programId: z.string().uuid(),
    /** Free text, "Sabtu, 09.00 · Google Meet". The Secretary reads it, nothing parses it. */
    preferredSlot: z.string().max(120).optional(),
    type: z.enum(['CONSULTATION', 'DIRECT']),

    // Attribution. Without it, marketing spend is unattributable, the single
    // most important question the business cannot answer today (FR-LEAD-2).
    source: z.string().max(64).default('direct'),
    medium: z.string().max(64).optional(),
    campaign: z.string().max(120).optional(),
    referrer: z.string().max(500).optional(),
    landingPage: z.string().max(500).optional(),

    // Honeypot. Real users never fill this; bots do.
    website: z.string().max(0).optional(),
  })
  .strict();

export const ConsultationOutcome = z
  .object({
    outcome: z.enum(['LANJUT', 'PIKIR_DULU', 'TIDAK_COCOK']),
    lossReason: z.enum(['PRICE', 'SCHEDULE', 'FIT', 'OTHER']).optional(),
    note: z.string().max(2000).optional(),
    /** Only meaningful for PIKIR_DULU, when to chase. */
    followUpAt: z.coerce.date().optional(),
  })
  .strict()
  // A lost lead without a reason teaches the business nothing (FR-LEAD-6).
  .refine((v) => v.outcome !== 'TIDAK_COCOK' || Boolean(v.lossReason), {
    message: 'lossReason wajib diisi ketika hasil konsultasi TIDAK_COCOK.',
    path: ['lossReason'],
  });

/**
 * Move a lead through the pipeline.
 *
 * CONVERTED is absent on purpose: it is not a status somebody sets, it is what
 * the conversion transaction leaves behind (doc 14 §1.4). Allowing it here would
 * let a lead be marked converted with no student, no enrolment and no invoice,
 * the funnel would report revenue that does not exist.
 */
export const UpdateLeadStatus = z
  .object({
    status: z.enum(['NEW', 'CONSULTING', 'NURTURING', 'REJECTED', 'LOST']),
    reason: z.string().max(2000).optional(),
    /** When to come back to this lead. Mandatory for NURTURING, see below. */
    followUpAt: z.coerce.date().optional(),
  })
  .strict()
  // Rejecting or losing a lead without a reason is the thing doc 13 §22 called
  // out: the business cannot learn from an outcome it did not record.
  .refine((v) => !['REJECTED', 'LOST'].includes(v.status) || Boolean(v.reason?.trim()), {
    message: 'Alasan wajib diisi ketika lead ditolak atau hilang.',
    path: ['reason'],
  })
  /**
   * NURTURING without a date is the same as doing nothing, dressed as a
   * decision. The lead leaves the "new" pile, nobody is told to come back to it,
   * and it is never seen again, which is exactly the disappearance `/inbox`
   * exists to prevent. Requiring the date is what makes "follow up later" mean
   * later rather than never.
   */
  .refine((v) => v.status !== 'NURTURING' || v.followUpAt instanceof Date, {
    message: 'Tentukan kapan lead ini akan dihubungi lagi.',
    path: ['followUpAt'],
  })
  .refine((v) => !v.followUpAt || v.followUpAt.getTime() > Date.now() - 86_400_000, {
    message: 'Tanggal follow-up tidak boleh di masa lalu.',
    path: ['followUpAt'],
  });

export const AddContact = z
  .object({
    note: z.string().min(1, 'Catatan tidak boleh kosong').max(2000),
    /** Optional next-touch date; drives the follow-up queue. */
    followUpAt: z.coerce.date().optional(),
  })
  .strict();

export type ListLeadsQueryInput = z.infer<typeof ListLeadsQuery>;
export type CreateLeadInput = z.infer<typeof CreateLead>;
export type ConsultationOutcomeInput = z.infer<typeof ConsultationOutcome>;
export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatus>;
export type AddContactInput = z.infer<typeof AddContact>;
