import { z } from 'zod';

/**
 * Page request contracts (doc 14 §2.6).
 *
 * `PageDraftBody` is the PATCH body the registry resolves. A page's own row is
 * deliberately thin, title, slug, description, because everything a visitor
 * sees lives in blocks, which have their own endpoints and their own schemas.
 */
export const PageDraftBody = z
  .object({
    title: z.string().min(2).max(200).optional(),
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung')
      .optional(),
    description: z.string().max(500).nullable().optional(),
    locale: z.enum(['id', 'en']).optional(),
  })
  .strict();

export const CreatePageBody = z
  .object({
    title: z.string().min(2).max(200),
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung')
      .optional(),
  })
  .strict();

/**
 * Creating a block. `props` is validated a second time, against the schema the
 * block registry holds for `type`. This only asserts it is an object.
 */
export const CreateBlockBody = z
  .object({
    type: z.string().min(1).max(60),
    props: z.record(z.string(), z.unknown()).optional(),
    /** Where to drop it. Appended to the end when absent. */
    afterBlockId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const UpdateBlockBody = z
  .object({
    props: z.record(z.string(), z.unknown()).optional(),
    visible: z.boolean().optional(),
    visibleFrom: z.coerce.date().nullable().optional(),
    visibleUntil: z.coerce.date().nullable().optional(),
  })
  .strict();

/**
 * A reorder is the WHOLE list, not a pair of indices.
 *
 * Sending "move block 3 to position 1" means the server has to reconstruct the
 * order the editor was looking at, and two editors dragging at once produce an
 * order neither of them chose. Sending the resulting sequence makes the write
 * idempotent and the outcome exactly what was on screen.
 */
export const ReorderBlocksBody = z
  .object({
    blockIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();

export type PageDraftInput = z.infer<typeof PageDraftBody>;
export type CreatePageInput = z.infer<typeof CreatePageBody>;
export type CreateBlockInput = z.infer<typeof CreateBlockBody>;
export type UpdateBlockInput = z.infer<typeof UpdateBlockBody>;
export type ReorderBlocksInput = z.infer<typeof ReorderBlocksBody>;
