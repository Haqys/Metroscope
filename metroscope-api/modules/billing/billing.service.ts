import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';
import { logger } from '@/lib/logger';
import { enqueue } from '@/lib/queue';
import { writeAuditLog } from '@/lib/audit';
import type { RequestContext } from '@/lib/auth/context';
import * as repo from './billing.repo';
import type {
  ConfirmProofInput,
  ListInvoicesQueryInput,
  RejectPaymentInput,
  RequestProofUploadInput,
  VerifyPaymentInput,
} from './billing.schema';

/**
 * Manual bank transfer, v1 (FR-PAY-2/3). Midtrans is deferred until the legal
 * entity exists, so the whole loop is: parent transfers → uploads a screenshot →
 * Finance looks at it → account activates.
 *
 * The thing that makes this safe is that the parent never states an amount and
 * never sets a status other than "please check this". Everything financial is
 * decided by whoever holds `payment.verify`.
 */
const PROOF_BUCKET = 'payment-proofs';

const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function listInvoices(ctx: RequestContext, query: ListInvoicesQueryInput) {
  const items = await repo.findInvoices(ctx, query);
  return {
    items,
    nextCursor: items.length === query.limit ? (items.at(-1)?.id ?? null) : null,
  };
}

export async function getInvoice(ctx: RequestContext, id: string) {
  const invoice = await repo.findInvoiceById(ctx, id);
  // Invisible and non-existent are the same answer, so ownership is not
  // confirmable by probing ids.
  if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Tagihan tidak ditemukan.');
  return invoice;
}

/**
 * A short-lived signed URL the browser uploads directly to.
 *
 * The file never passes through this service. Proxying 2 MB of image through a
 * serverless function costs an invocation's memory and time for no benefit, and
 * the bucket is private either way, the URL is the only way in, it expires, and
 * the key is server-chosen so a caller cannot aim their upload at somebody
 * else's path.
 */
export async function requestProofUpload(
  ctx: RequestContext,
  id: string,
  input: RequestProofUploadInput,
) {
  const invoice = await getInvoice(ctx, id);

  if (invoice.status === 'PAID' || invoice.status === 'VOID' || invoice.status === 'REFUNDED') {
    throw new ApiError(422, 'INVOICE_NOT_PAYABLE', 'Tagihan ini sudah tidak bisa dibayar.');
  }

  const ext = (input.filename.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Keyed by invoice, so a proof can only ever belong to one bill, and stamped
  // so a re-upload after rejection does not overwrite the rejected evidence.
  const key = `${invoice.studentId}/${id}/${Date.now()}.${ext || 'jpg'}`;

  const { data, error } = await storage.storage.from(PROOF_BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    logger.error('proof_upload_url_failed', { invoiceId: id, message: error?.message });
    throw new ApiError(502, 'STORAGE_ERROR', 'Tidak bisa menyiapkan unggahan. Coba lagi.');
  }

  return { uploadUrl: data.signedUrl, token: data.token, proofKey: key, maxBytes: 2 * 1024 * 1024 };
}

export async function confirmProof(ctx: RequestContext, id: string, input: ConfirmProofInput) {
  const invoice = await getInvoice(ctx, id);

  /**
   * The key must live under this invoice's prefix.
   *
   * Without this a caller could confirm somebody else's uploaded proof against
   * their own invoice, pointing Finance at a stranger's genuine transfer
   * screenshot and getting their own bill approved on it.
   */
  if (!input.proofKey.startsWith(`${invoice.studentId}/${id}/`)) {
    throw new ApiError(422, 'PROOF_KEY_MISMATCH', 'Bukti tidak cocok dengan tagihan ini.');
  }

  // Confirm the object actually exists, otherwise a failed upload would still
  // move the invoice into the queue and Finance would open nothing.
  const { data: found, error: listErr } = await storage.storage
    .from(PROOF_BUCKET)
    .list(`${invoice.studentId}/${id}`, { limit: 100 });
  if (listErr) {
    throw new ApiError(502, 'STORAGE_ERROR', 'Tidak bisa memeriksa bukti transfer.');
  }
  const filename = input.proofKey.split('/').pop();
  if (!found?.some((f) => f.name === filename)) {
    throw new ApiError(422, 'PROOF_NOT_UPLOADED', 'Bukti transfer belum terunggah.');
  }

  const updated = await repo.attachProof(ctx, id, input.proofKey);
  if (!updated) {
    throw new ApiError(403, 'FORBIDDEN', 'Kamu tidak berwenang mengubah tagihan ini.');
  }

  await enqueue('notification.payment-submitted', { invoiceId: id });
  await writeAuditLog({
    ctx,
    action: 'payment.proof-submitted',
    entity: 'invoice',
    entityId: id,
    after: { status: updated.status },
  });

  return updated;
}

/** A signed URL Finance can open to look at the proof. Short-lived by design. */
export async function proofViewUrl(ctx: RequestContext, id: string) {
  const invoice = await getInvoice(ctx, id);
  if (!invoice.proofKey) {
    throw new ApiError(404, 'NO_PROOF', 'Belum ada bukti transfer di tagihan ini.');
  }

  const { data, error } = await storage.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(invoice.proofKey, 300);
  if (error || !data) {
    throw new ApiError(502, 'STORAGE_ERROR', 'Tidak bisa membuka bukti transfer.');
  }
  return { url: data.signedUrl, expiresInSeconds: 300 };
}

export async function verifyPayment(ctx: RequestContext, id: string, input: VerifyPaymentInput) {
  const before = await repo.findInvoiceById(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Tagihan tidak ditemukan.');

  let result;
  try {
    result = await repo.verify(
      ctx,
      id,
      input.grossAmount ?? null,
      input.method,
      input.note ?? null,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'ALREADY_PAID') {
      throw new ApiError(409, 'ALREADY_PAID', 'Tagihan ini sudah lunas.');
    }
    if (message === 'INVOICE_CLOSED') {
      throw new ApiError(422, 'INVOICE_CLOSED', 'Tagihan ini sudah ditutup.');
    }
    if (message === 'INVOICE_NOT_FOUND') {
      throw new ApiError(404, 'NOT_FOUND', 'Tagihan tidak ditemukan.');
    }
    logger.error('verify_payment_failed', { invoiceId: id, message });
    throw new ApiError(500, 'VERIFY_FAILED', 'Verifikasi gagal. Tidak ada perubahan tersimpan.');
  }

  await enqueue('notification.payment-verified', {
    invoiceId: id,
    paymentId: result.paymentId,
    activated: result.activated,
  });

  // Every verification writes an audit row (FR-PAY-3). This is money changing
  // hands on somebody's say-so, and the before/after is the record of whose.
  await writeAuditLog({
    ctx,
    action: 'payment.verified',
    entity: 'invoice',
    entityId: id,
    before: { status: before.status, paidAmount: before.paidAmount },
    after: { status: result.status, paidAmount: result.paidAmount },
    meta: {
      paymentId: result.paymentId,
      method: input.method,
      activatedAccount: result.activated,
    },
  });

  logger.info('payment_verified', {
    invoiceId: id,
    paymentId: result.paymentId,
    status: result.status,
    activated: result.activated,
    requestId: ctx.requestId,
  });

  return result;
}

export async function rejectPayment(ctx: RequestContext, id: string, input: RejectPaymentInput) {
  const before = await repo.findInvoiceById(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Tagihan tidak ditemukan.');
  if (before.status !== 'AWAITING_VERIFICATION') {
    throw new ApiError(
      422,
      'NOT_AWAITING_VERIFICATION',
      'Tagihan ini tidak sedang menunggu verifikasi.',
    );
  }

  const updated = await repo.reject(ctx, id);
  if (!updated) throw new ApiError(409, 'CONFLICT', 'Status tagihan sudah berubah.');

  await enqueue('notification.payment-rejected', { invoiceId: id, reason: input.reason });
  await writeAuditLog({
    ctx,
    action: 'payment.rejected',
    entity: 'invoice',
    entityId: id,
    before: { status: before.status },
    after: { status: updated.status },
    meta: { reason: input.reason },
  });

  return updated;
}
