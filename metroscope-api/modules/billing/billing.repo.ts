import { sql } from 'drizzle-orm';
import type { RequestContext } from '@/lib/auth/context';
import { asUser, withElevatedPrivileges } from '@/lib/db/rls';
import type { ListInvoicesQueryInput } from './billing.schema';

/**
 * Invoice and payment data access.
 *
 * Reads and the parent's own proof submission run AS THE CALLER, so RLS decides
 * what is visible and the column trigger decides what is writable. Only
 * verification elevates, and only because it has to touch the student's account
 * status, a row Finance can read but has no business updating directly.
 */

export interface InvoiceRow extends Record<string, unknown> {
  id: string;
  number: string;
  studentId: string;
  studentName: string;
  amount: number;
  paidAmount: number;
  period: string;
  type: string;
  status: string;
  dueDate: string;
  proofKey: string | null;
  proofUploadedAt: string | null;
  issuedAt: string;
  paidAt: string | null;
}

const SELECT_INVOICE = sql`
  SELECT i.id,
         i.number,
         i.student_id        AS "studentId",
         s.name              AS "studentName",
         i.amount,
         COALESCE((SELECT sum(p.gross_amount)::int FROM payments p
                   WHERE p.invoice_id = i.id AND p.verified_at IS NOT NULL), 0) AS "paidAmount",
         i.period,
         i.type,
         i.status,
         i.due_date          AS "dueDate",
         i.proof_key         AS "proofKey",
         i.proof_uploaded_at AS "proofUploadedAt",
         i.issued_at         AS "issuedAt",
         i.paid_at           AS "paidAt"
  FROM invoices i
  JOIN students s ON s.id = i.student_id
`;

export async function findInvoices(
  ctx: RequestContext,
  q: ListInvoicesQueryInput,
): Promise<InvoiceRow[]> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<InvoiceRow>(sql`
      ${SELECT_INVOICE}
      WHERE (${q.status ?? null}::text IS NULL OR i.status::text = ${q.status ?? null})
        AND (${q.studentId ?? null}::uuid IS NULL OR i.student_id = ${q.studentId ?? null}::uuid)
        AND (
          ${q.cursor ?? null}::uuid IS NULL
          OR (i.issued_at, i.id) <
             (SELECT c.issued_at, c.id FROM invoices c WHERE c.id = ${q.cursor ?? null}::uuid)
        )
      ORDER BY i.issued_at DESC, i.id DESC
      LIMIT ${q.limit}
    `);
    return Array.from(rows) as InvoiceRow[];
  });
}

export async function findInvoiceById(ctx: RequestContext, id: string): Promise<InvoiceRow | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<InvoiceRow>(sql`${SELECT_INVOICE} WHERE i.id = ${id}::uuid`);
    return (Array.from(rows) as InvoiceRow[]).at(0) ?? null;
  });
}

/**
 * Attach the proof and move into the verification queue.
 *
 * Runs as the caller on purpose. The RLS policy decides this is their invoice,
 * and `app.guard_invoice_columns()` decides these are the only two columns plus
 * the one status transition they may touch. Elevating here would bypass both
 * and make the guard decorative for the one path it was written for.
 */
export async function attachProof(
  ctx: RequestContext,
  id: string,
  proofKey: string,
): Promise<{ id: string; status: string } | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; status: string }>(sql`
      UPDATE invoices
      SET proof_key = ${proofKey},
          proof_uploaded_at = now(),
          status = 'AWAITING_VERIFICATION'
      WHERE id = ${id}::uuid
      RETURNING id, status
    `);
    return (Array.from(rows) as Array<{ id: string; status: string }>).at(0) ?? null;
  });
}

export interface VerifyResult extends Record<string, unknown> {
  invoiceId: string;
  paymentId: string;
  status: string;
  paidAmount: number;
  amount: number;
  studentId: string;
  activated: boolean;
}

/**
 * Record a settlement and settle the consequences, in ONE transaction.
 *
 * Three things move together and none of them is safe alone: the payment row is
 * the money, the invoice status is what the parent sees, and the account status
 * is whether the child can open a lesson. A partial apply here produces a family
 * that paid and is still locked out, which is the complaint the whole flow
 * exists to prevent (FR-ENR-4/5).
 *
 * Elevated because activating the account writes to `students`, which Finance
 * can read but holds no `student.edit` grant for, and should not, since that
 * grant also allows editing the academic record.
 */
export async function verify(
  ctx: RequestContext,
  id: string,
  grossAmount: number | null,
  method: string,
  note: string | null,
): Promise<VerifyResult> {
  return withElevatedPrivileges(
    ctx,
    'payment.settle',
    `verify payment on invoice ${id}`,
    async (tx) => {
      // Lock the invoice: two Finance tabs approving the same proof must not
      // produce two payment rows.
      const locked = await tx.execute<{
        id: string;
        student_id: string;
        amount: number;
        status: string;
        settled: number;
      }>(sql`
      SELECT i.id, i.student_id, i.amount, i.status::text AS status,
             COALESCE((SELECT sum(p.gross_amount)::int FROM payments p
                       WHERE p.invoice_id = i.id AND p.verified_at IS NOT NULL), 0) AS settled
      FROM invoices i WHERE i.id = ${id}::uuid FOR UPDATE
    `);
      const inv = (
        Array.from(locked) as Array<{
          id: string;
          student_id: string;
          amount: number;
          status: string;
          settled: number;
        }>
      ).at(0);
      if (!inv) throw new Error('INVOICE_NOT_FOUND');
      if (inv.status === 'PAID') throw new Error('ALREADY_PAID');
      if (inv.status === 'VOID' || inv.status === 'REFUNDED') throw new Error('INVOICE_CLOSED');

      const outstanding = Number(inv.amount) - Number(inv.settled);
      const received = grossAmount ?? outstanding;

      const paymentRows = await tx.execute<{ id: string }>(sql`
      INSERT INTO payments (invoice_id, gross_amount, method, verified_by_id, verified_at, note)
      VALUES (${id}::uuid, ${received}, ${method}::payment_method,
              ${ctx.user?.id ?? null}, now(), ${note})
      RETURNING id
    `);
      const paymentId = (Array.from(paymentRows) as { id: string }[]).at(0)?.id;
      if (!paymentId) throw new Error('PAYMENT_INSERT_FAILED');

      const settledTotal = Number(inv.settled) + received;
      /**
       * Fully settled, or a part payment (FR-PAY-5). `>=` rather than `===`
       * because a parent who transfers a round number slightly over should not
       * leave the invoice stuck one rupiah short of paid.
       */
      const fullyPaid = settledTotal >= Number(inv.amount);

      await tx.execute(sql`
      UPDATE invoices
      SET status  = ${fullyPaid ? 'PAID' : 'INSTALLMENT'}::invoice_status,
          method  = ${method}::payment_method,
          paid_at = ${fullyPaid ? sql`now()` : sql`NULL`}
      WHERE id = ${id}::uuid
    `);

      /**
       * First verified payment activates the account (FR-ENR-5).
       *
       * Only on full settlement: a family part-way through paying has not
       * completed enrolment, and unlocking early would make the remaining balance
       * unenforceable. The WHERE clause makes this idempotent, a second
       * verification on an already-active student changes nothing.
       */
      let activated = false;
      if (fullyPaid) {
        const act = await tx.execute<{ id: string }>(sql`
        UPDATE students
        SET account_status = 'ACTIVE'
        WHERE id = ${inv.student_id}::uuid AND account_status = 'LIMITED'
        RETURNING id
      `);
        activated = Array.from(act).length > 0;
      }

      return {
        invoiceId: id,
        paymentId,
        status: fullyPaid ? 'PAID' : 'INSTALLMENT',
        paidAmount: settledTotal,
        amount: Number(inv.amount),
        studentId: inv.student_id,
        activated,
      };
    },
  );
}

/**
 * Send a proof back.
 *
 * The proof key is cleared so the parent must upload a new one, leaving the old
 * file attached to a rejected invoice invites re-submitting the same wrong
 * screenshot, and leaves Finance unsure which one they already looked at.
 */
export async function reject(
  ctx: RequestContext,
  id: string,
): Promise<{ id: string; status: string } | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; status: string }>(sql`
      UPDATE invoices
      SET status = CASE WHEN due_date < CURRENT_DATE THEN 'OVERDUE' ELSE 'UNPAID' END::invoice_status,
          proof_key = NULL,
          proof_uploaded_at = NULL
      WHERE id = ${id}::uuid AND status = 'AWAITING_VERIFICATION'
      RETURNING id, status
    `);
    /**
     * No activity_event row here.
     *
     * The table has a SELECT policy and no INSERT policy, so writing it as
     * `authenticated` fails, correctly. An INSERT policy would let any session
     * forge entries on somebody else's timeline, which is worse than not having
     * a timeline yet. The rejection and its reason are already captured by
     * writeAuditLog() in the service, which runs on the owner connection.
     *
     * When the activity feed is built, it should be populated the same way the
     * audit log is: by the system, never by the caller.
     */
    return (Array.from(rows) as Array<{ id: string; status: string }>).at(0) ?? null;
  });
}
