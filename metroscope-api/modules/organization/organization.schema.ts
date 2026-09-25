import { z } from 'zod';

/**
 * Destination bank accounts (FR-PAY-2).
 *
 * Validation is deliberately loose on the number: Indonesian account numbers
 * vary by bank in length and some are written with dashes. Rejecting a valid
 * account because a regex was too clever costs Finance a support call and gains
 * nothing, a wrong number is caught by the parent seeing it, not by us.
 */
export const UpsertBankAccount = z
  .object({
    bankName: z.string().min(2, 'Nama bank wajib diisi').max(80),
    accountNumber: z
      .string()
      .min(5, 'Nomor rekening terlalu pendek')
      .max(40)
      .regex(/^[0-9 .-]+$/, 'Nomor rekening hanya boleh angka, spasi, titik, atau strip'),
    accountHolder: z.string().min(2, 'Nama pemilik rekening wajib diisi').max(120),
    note: z.string().max(200).optional(),
    isActive: z.boolean().default(true),
    orderIndex: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict();

export type UpsertBankAccountInput = z.infer<typeof UpsertBankAccount>;
