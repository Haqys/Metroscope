import { z } from 'zod';

/**
 * Contract for payment and verification (FR-PAY-2..5).
 *
 * The parent never sends an amount, and neither does Finance on approval,
 * `grossAmount` on verification is what was ACTUALLY received, which is a
 * different thing from what was billed. That distinction is what makes partial
 * payments representable (FR-PAY-5) without letting anyone rewrite the bill.
 */
export const ListInvoicesQuery = z
  .object({
    status: z
      .enum([
        // Finance filters by this to review a drafted month before issuing it.
        // RLS still hides DRAFT rows from guardians, so exposing it here widens
        // nothing. It only lets the review screen ask for them.
        'DRAFT',
        'UNPAID',
        'AWAITING_VERIFICATION',
        'PAID',
        'PARTIALLY_PAID',
        'INSTALLMENT',
        'OVERDUE',
        'VOID',
        'REFUNDED',
      ])
      .optional(),
    studentId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().uuid().optional(),
  })
  .strict();

/** Step 1 of proof upload: ask for somewhere to put the file. */
export const RequestProofUpload = z
  .object({
    /** Used only for the extension; the key is server-generated. */
    filename: z.string().min(1).max(200),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  })
  .strict();

/** Step 2: confirm the upload landed, which moves the invoice into the queue. */
export const ConfirmProof = z
  .object({
    /**
     * Must be the key handed out in step 1. The service checks it belongs to
     * this invoice, otherwise a caller could point their invoice at somebody
     * else's uploaded proof.
     */
    proofKey: z.string().min(1).max(300),
  })
  .strict();

export const VerifyPayment = z
  .object({
    /**
     * What actually arrived in the bank, in integer IDR. Optional: omitted means
     * "the full outstanding amount", which is the common case and saves Finance
     * retyping a number they can already see.
     */
    grossAmount: z.coerce.number().int().positive().optional(),
    method: z.enum(['TRANSFER', 'CASH']).default('TRANSFER'),
    note: z.string().max(1000).optional(),
  })
  .strict();

export const RejectPayment = z
  .object({
    /**
     * Required. A rejected proof with no reason means the parent re-uploads the
     * same wrong screenshot, and Finance reviews it again, doc 13 §22's
     * complaint about unrecorded outcomes, applied to money.
     */
    reason: z.string().min(5, 'Tulis alasan penolakan.').max(1000),
  })
  .strict();

export type ListInvoicesQueryInput = z.infer<typeof ListInvoicesQuery>;
export type RequestProofUploadInput = z.infer<typeof RequestProofUpload>;
export type ConfirmProofInput = z.infer<typeof ConfirmProof>;
export type VerifyPaymentInput = z.infer<typeof VerifyPayment>;
export type RejectPaymentInput = z.infer<typeof RejectPayment>;
