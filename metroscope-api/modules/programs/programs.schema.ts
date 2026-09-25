import { z } from 'zod';

/**
 * Programme request contracts (doc 14 §2.5).
 *
 * The PATCH body is `ProgramDraftBody` in `content.schema.ts`, because the
 * registry imports it and must not pull the service graph in behind it.
 */
export const CreateProgramBody = z
  .object({
    name: z.string().min(3).max(160),
    slug: z.string().min(2).max(120).optional(),
    category: z.enum(['ACADEMIC', 'NON_ACADEMIC', 'CREATIVE']),
    levels: z
      .array(z.enum(['SD', 'SMP', 'SMA']))
      .min(1)
      .max(3),
    /** Integer IDR, money is integers everywhere in this system. */
    priceMonthly: z.number().int().min(0).max(1_000_000_000),
    durationMonths: z.number().int().min(1).max(60).optional(),
  })
  .strict();

export type CreateProgramInput = z.infer<typeof CreateProgramBody>;
