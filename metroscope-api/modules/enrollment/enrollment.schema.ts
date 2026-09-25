import { z } from 'zod';

/**
 * Contract for converting a lead into a paying student (FR-ENR-1).
 *
 * Note what is NOT here: any amount. Money is server-authoritative, the price
 * comes from the programme and is snapshotted onto the enrolment (FR-ENR-2), so
 * a client cannot propose what it will be billed.
 */
export const ConvertLead = z
  .object({
    /**
     * Overrides the programme captured on the lead. Optional because most
     * conversions keep what the parent asked for; required in effect when the
     * lead arrived without one, which the service enforces with a clear error.
     */
    programId: z.string().uuid().optional(),
    /** Enrolment start. Defaults to today. */
    startedAt: z.coerce.date().optional(),
    /** Overrides the guardian's name on the student record. */
    parentName: z.string().min(2).max(120).optional(),
  })
  .strict();

export type ConvertLeadInput = z.infer<typeof ConvertLead>;
