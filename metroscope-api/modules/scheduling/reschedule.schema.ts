import { z } from 'zod';

/**
 * Reschedule requests, request shapes (doc 13 §12.6, doc 14 §3.2).
 */

const iso = z.string().datetime({ offset: true });

/**
 * What the family sends. `reason` is a short code the wizard offers plus free
 * text in `note`, because "Sakit" aggregates and "anaknya demam sejak Senin"
 * does not, and doc 13 §12.2 already made that distinction for consultation
 * outcomes.
 */
export const CreateRescheduleBody = z
  .object({
    sessionId: z.string().uuid(),
    reason: z.string().min(3).max(200),
    note: z.string().max(1000).nullable().optional(),
    /** Optional: staff decide the final time, and often cannot honour this one. */
    preferredStartsAt: iso.nullable().optional(),
  })
  .strict();

/**
 * Approving names the time the lesson actually moves to.
 *
 * `startsAt` is required rather than defaulting to the family's preference: the
 * whole reason a human is in this loop is that the preferred slot may be taken,
 * and a default that silently books it would make the queue a rubber stamp. The
 * UI pre-fills it, which is a different thing.
 */
export const ApproveRescheduleBody = z
  .object({
    startsAt: iso,
    durationMin: z.coerce.number().int().min(15).max(480).optional(),
    mentorId: z.string().uuid().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

/** A refusal with no reason is a dead end for the family that asked. */
export const RejectRescheduleBody = z.object({ note: z.string().min(3).max(500) }).strict();

export const ListRescheduleQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateRescheduleInput = z.infer<typeof CreateRescheduleBody>;
export type ApproveRescheduleInput = z.infer<typeof ApproveRescheduleBody>;
export type RejectRescheduleInput = z.infer<typeof RejectRescheduleBody>;
export type ListRescheduleInput = z.infer<typeof ListRescheduleQuery>;
