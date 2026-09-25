import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';
import { logger } from '@/lib/logger';
import { enqueue } from '@/lib/queue';
import { writeAuditLog } from '@/lib/audit';
import type { RequestContext } from '@/lib/auth/context';
import * as repo from './enrollment.repo';
import type { ConvertLeadInput } from './enrollment.schema';

/**
 * Convert a lead into a paying student (FR-ENR-1).
 *
 * The account has to exist in Supabase Auth before the transaction can run,
 * because `users.id` mirrors `auth.users.id` and the admin API assigns that id.
 * So the order is: ensure the auth user, then one database transaction.
 *
 * That leaves one seam, and it is worth naming rather than hiding. If the
 * transaction rolls back, the auth user survives with no rows behind it. That is
 * the safe direction of the two, an auth account with nothing attached cannot
 * sign in to anything meaningful, whereas a student with no login would be
 * invisible to the family it belongs to. Retrying finds the account by email and
 * reuses it, so the orphan is consumed rather than accumulating.
 */
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Find or create the guardian's auth account. Idempotent by email. */
async function ensureAuthUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    /**
     * No password. The parent sets one from the link in their welcome email
     * (FR-ENR-3), inventing one here would mean either emailing a plaintext
     * password or creating an account nobody can get into.
     */
  });

  if (!error && data.user) return data.user.id;

  /**
   * Already registered is the sibling case, and the retry case. Look the
   * account up rather than failing: one guardian, one login, however many
   * children.
   */
  const alreadyExists = /already|registered|exists/i.test(error?.message ?? '');
  if (!alreadyExists) {
    logger.error('convert_auth_user_failed', { message: error?.message });
    throw new ApiError(
      502,
      'AUTH_UPSTREAM_ERROR',
      'Tidak bisa membuat akun orang tua. Coba lagi sebentar lagi.',
    );
  }

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    throw new ApiError(502, 'AUTH_UPSTREAM_ERROR', 'Tidak bisa memeriksa akun orang tua.');
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    throw new ApiError(502, 'AUTH_UPSTREAM_ERROR', 'Akun orang tua tidak dapat dipastikan.');
  }
  return existing.id;
}

export async function convertLead(ctx: RequestContext, id: string, input: ConvertLeadInput) {
  const lead = await repo.findConvertible(ctx, id);
  if (!lead) throw new ApiError(404, 'NOT_FOUND', 'Pendaftar tidak ditemukan.');

  if (lead.convertedStudentId) {
    throw new ApiError(
      409,
      'ALREADY_CONVERTED',
      'Pendaftar ini sudah pernah dikonversi menjadi siswa.',
    );
  }
  if (lead.status === 'REJECTED' || lead.status === 'LOST') {
    throw new ApiError(
      422,
      'LEAD_CLOSED',
      'Pendaftar ini sudah ditutup. Buka kembali statusnya sebelum konversi.',
    );
  }

  /**
   * No email, no account. The parent signs in to pay (FR-ENR-4), so converting
   * without an address would produce an invoice nobody can reach, the exact
   * "stranded user" FR-ENR-1 was written to prevent.
   */
  if (!lead.parentEmail) {
    throw new ApiError(
      422,
      'PARENT_EMAIL_REQUIRED',
      'Pendaftar ini belum punya email orang tua. Lengkapi dulu sebelum konversi.',
    );
  }

  const programId = input.programId ?? lead.programId;
  if (!programId) {
    throw new ApiError(422, 'PROGRAM_REQUIRED', 'Pilih program dulu sebelum konversi.');
  }

  const program = await repo.findProgram(ctx, programId);
  if (!program) throw new ApiError(422, 'PROGRAM_NOT_FOUND', 'Program tidak ditemukan.');
  if (program.priceMonthly <= 0) {
    throw new ApiError(
      422,
      'PROGRAM_PRICE_INVALID',
      'Harga program belum diatur, jadi tagihan tidak bisa diterbitkan.',
    );
  }

  const parentName = input.parentName ?? lead.parentName ?? 'Orang Tua';
  const authUserId = await ensureAuthUser(lead.parentEmail, parentName);

  let result;
  try {
    result = await repo.convert(ctx, {
      registrationId: id,
      authUserId,
      email: lead.parentEmail,
      parentName,
      childName: lead.childName,
      school: lead.school,
      level: lead.level,
      parentPhone: lead.parentPhone,
      programId,
      priceMonthly: program.priceMonthly,
      startedAt: (input.startedAt ?? new Date()).toISOString().slice(0, 10),
      slug: repo.slugFor(lead.childName),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Lost the race to a concurrent conversion, the row lock did its job.
    if (message === 'ALREADY_CONVERTED') {
      throw new ApiError(409, 'ALREADY_CONVERTED', 'Pendaftar ini sudah dikonversi.');
    }
    logger.error('convert_transaction_failed', { registrationId: id, message });
    throw new ApiError(500, 'CONVERSION_FAILED', 'Konversi gagal. Tidak ada data yang tersimpan.');
  }

  /**
   * Enqueued AFTER the transaction commits, on purpose.
   *
   * `enqueue()` writes to the outbox on its own connection, so putting it inside
   * would not have made it atomic anyway, and emailing a parent "your invoice
   * is ready" for a conversion that then rolled back is worse than a late email.
   */
  await enqueue('notification.enrollment-created', {
    registrationId: id,
    studentId: result.studentId,
    invoiceId: result.invoiceId,
  });

  await writeAuditLog({
    ctx,
    action: 'lead.converted',
    entity: 'registration',
    entityId: id,
    after: {
      studentId: result.studentId,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      amount: result.amount,
    },
    meta: { programId, priceMonthly: program.priceMonthly },
  });

  logger.info('lead_converted', {
    registrationId: id,
    studentId: result.studentId,
    invoiceNumber: result.invoiceNumber,
    amount: result.amount,
    requestId: ctx.requestId,
  });

  return result;
}
