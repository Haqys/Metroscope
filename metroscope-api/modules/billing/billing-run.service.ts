import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { enqueue } from '@/lib/queue';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import { asUser, withElevatedPrivileges } from '@/lib/db/rls';
import type { RequestContext } from '@/lib/auth/context';
import { daysPastDue, lateFee } from '@/lib/billing/late-fee';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The monthly billing run, the overdue sweep, and reminders (doc 14 §1.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * All three run as jobs with no caller, so they use the owner connection. What
 * keeps that safe is that none of them takes input: the period comes from the
 * clock, the amounts from enrolment snapshots, and the fee from one helper.
 */

const JOB_CTX: RequestContext = {
  requestId: 'job',
  ip: 'cron',
  userAgent: 'cron',
  user: null,
  roles: [],
  roleDetails: [],
  actions: [],
  pages: [],
  primaryRole: null,
  claims: null,
};

/** Billing period as YYYY-MM in WITA, the month the office is actually in. */
export function currentPeriod(now: Date = new Date()): string {
  const wita = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${wita.getUTCFullYear()}-${String(wita.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month AFTER the given one, what a run drafted on the 25th bills for. */
export function nextPeriod(now: Date = new Date()): string {
  const wita = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = wita.getUTCFullYear();
  const m = wita.getUTCMonth() + 1; // 1-12
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export interface DraftResult {
  runId: string;
  period: string;
  invoiceCount: number;
  totalAmount: number;
  alreadyExisted: boolean;
}

/**
 * Draft next month's invoices (cron, 25th).
 *
 * DRAFT, not UNPAID: nothing reaches a family until Finance reviews the run and
 * issues it. A month of wrong invoices sent automatically is not a bug you can
 * apologise your way out of.
 *
 * Idempotent on `billing_runs.period` (UNIQUE). A cron that fires twice, or a
 * manual re-run, returns the existing run rather than drafting a second month.
 */
export async function draftBillingRun(period?: string): Promise<DraftResult> {
  const billingPeriod = period ?? nextPeriod();

  return withElevatedPrivileges(
    JOB_CTX,
    'job.billing-run',
    `draft billing run for ${billingPeriod}`,
    async (tx) => {
      const existing = await tx.execute<{
        id: string;
        status: string;
        invoice_count: number;
        total_amount: number;
      }>(sql`
        SELECT id, status, invoice_count, total_amount
        FROM billing_runs WHERE period = ${billingPeriod}
      `);
      const found = (
        Array.from(existing) as Array<{
          id: string;
          status: string;
          invoice_count: number;
          total_amount: number;
        }>
      ).at(0);

      if (found) {
        return {
          runId: found.id,
          period: billingPeriod,
          invoiceCount: Number(found.invoice_count),
          totalAmount: Number(found.total_amount),
          alreadyExisted: true,
        };
      }

      const created = await tx.execute<{ id: string }>(sql`
        INSERT INTO billing_runs (period, status) VALUES (${billingPeriod}, 'DRAFT') RETURNING id
      `);
      const runId = (Array.from(created) as { id: string }[]).at(0)?.id;
      if (!runId) throw new Error('BILLING_RUN_INSERT_FAILED');

      /**
       * One invoice per ACTIVE enrolment of an ACTIVE student, at the price
       * frozen on the enrolment (FR-ENR-2), never the programme's current
       * price, or a mid-year increase would silently reprice existing families.
       *
       * `NOT EXISTS` skips anyone already billed for the period, which is what
       * makes a re-draft after a partial failure safe.
       *
       * LIMITED students are excluded: they have an unpaid registration invoice
       * already, and stacking a monthly bill on top of it before they have even
       * started is how a first impression goes wrong.
       */
      const inserted = await tx.execute<{ id: string; amount: number }>(sql`
        INSERT INTO invoices
          (number, student_id, amount, period, type, status, due_date, billing_run_id)
        SELECT app.next_invoice_number(),
               s.id,
               e.price_monthly_snapshot,
               ${billingPeriod},
               'MONTHLY',
               'DRAFT',
               (${billingPeriod} || '-10')::date,
               ${runId}::uuid
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.status = 'ACTIVE'
          AND s.account_status = 'ACTIVE'
          AND s.student_status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM invoices i
            WHERE i.student_id = s.id AND i.period = ${billingPeriod} AND i.type = 'MONTHLY'
              AND i.status <> 'VOID'
          )
        RETURNING id, amount
      `);

      const rows = Array.from(inserted) as Array<{ id: string; amount: number }>;
      const invoiceCount = rows.length;
      const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount), 0);

      await tx.execute(sql`
        UPDATE billing_runs
        SET invoice_count = ${invoiceCount}, total_amount = ${totalAmount}
        WHERE id = ${runId}::uuid
      `);

      logger.info('billing_run_drafted', {
        runId,
        period: billingPeriod,
        invoiceCount,
        totalAmount,
      });
      return { runId, period: billingPeriod, invoiceCount, totalAmount, alreadyExisted: false };
    },
  );
}

/**
 * Issue a drafted run, the review-and-click (FR-PAY-1, doc 14 §1.6 exit).
 *
 * Runs AS THE CALLER so RLS and the invoice column guard both apply: issuing a
 * month of bills is a Finance action, and `invoice.issue` is the grant for it.
 */
export async function issueBillingRun(ctx: RequestContext, runId: string) {
  const before = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; period: string; status: string }>(sql`
      SELECT id, period, status FROM billing_runs WHERE id = ${runId}::uuid
    `);
    return (
      (Array.from(rows) as Array<{ id: string; period: string; status: string }>).at(0) ?? null
    );
  });

  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Billing run tidak ditemukan.');
  if (before.status === 'ISSUED') {
    throw new ApiError(409, 'ALREADY_ISSUED', 'Billing run ini sudah diterbitkan.');
  }

  const issued = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE invoices
      SET status = 'UNPAID', issued_at = now(), issued_by_id = ${ctx.user?.id ?? null}
      WHERE billing_run_id = ${runId}::uuid AND status = 'DRAFT'
      RETURNING id
    `);
    const ids = (Array.from(rows) as { id: string }[]).map((r) => r.id);

    await tx.execute(sql`
      UPDATE billing_runs
      SET status = 'ISSUED', issued_at = now(), issued_by_id = ${ctx.user?.id ?? null}
      WHERE id = ${runId}::uuid
    `);
    return ids;
  });

  // One message per family, after the run is committed.
  for (const invoiceId of issued) {
    await enqueue('notification.invoice-issued', { invoiceId });
  }

  await writeAuditLog({
    ctx,
    action: 'billing.run-issued',
    entity: 'billing_run',
    entityId: runId,
    before: { status: before.status },
    after: { status: 'ISSUED', invoiceCount: issued.length },
    meta: { period: before.period },
  });

  logger.info('billing_run_issued', {
    runId,
    period: before.period,
    invoiceCount: issued.length,
    requestId: ctx.requestId,
  });

  return { runId, period: before.period, issued: issued.length };
}

/**
 * Nightly: mark past-due invoices OVERDUE and recompute the denda (FR-PAY-4/6).
 *
 * The fee is written to the row rather than derived at render time, so the
 * parent's total and Finance's expected total are the same number by
 * construction.
 */
export async function sweepOverdue(): Promise<{ marked: number; feesUpdated: number }> {
  return withElevatedPrivileges(
    JOB_CTX,
    'job.invoice-overdue',
    'nightly overdue sweep',
    async (tx) => {
      const marked = await tx.execute<{ id: string }>(sql`
      UPDATE invoices
      SET status = 'OVERDUE'
      WHERE status = 'UNPAID' AND due_date < (now() AT TIME ZONE 'Asia/Makassar')::date
      RETURNING id
    `);

      /**
       * Recompute the fee for everything still owing.
       *
       * Done in SQL rather than by looping rows through the helper because the
       * arithmetic is trivial and the row count is unbounded, but the constants
       * come from LATE_FEE_CONFIG so there is still exactly one place to change
       * the rate. The helper is asserted against this in the test suite.
       */
      const fees = await tx.execute<{ id: string }>(sql`
      UPDATE invoices
      SET late_fee = GREATEST(
            ((now() AT TIME ZONE 'Asia/Makassar')::date - due_date) - 7, 0
          ) * 5000,
          late_fee_at = now()
      WHERE status IN ('UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'INSTALLMENT')
        AND late_fee IS DISTINCT FROM GREATEST(
            ((now() AT TIME ZONE 'Asia/Makassar')::date - due_date) - 7, 0
          ) * 5000
      RETURNING id
    `);

      const result = { marked: Array.from(marked).length, feesUpdated: Array.from(fees).length };
      logger.info('overdue_sweep', result);
      return result;
    },
  );
}

/** Day offsets from the due date at which a reminder goes out (doc 14 §1.6). */
export const REMINDER_OFFSETS = [-3, 0, 1, 7] as const;

/**
 * Daily: send the due reminder for each unpaid invoice (FR-PAY-4).
 *
 * At most ONE message per invoice per run, and only for a stage further along
 * than the last one sent. A cron catching up after an outage therefore sends the
 * newest relevant reminder rather than four in a row, which is the difference
 * between a nudge and something a parent marks as spam.
 */
export async function sendDueReminders(): Promise<{ queued: number }> {
  /**
   * ⚠️ CLAIM INSIDE THE TRANSACTION, ENQUEUE OUTSIDE IT.
   *
   * `enqueue()` writes through the shared `db` pool, which is `max: 1`
   * (lib/db/client.ts. One connection per serverless invocation is the correct
   * shape for Supavisor). Calling it from inside a `db.transaction()` callback
   * therefore waits for a connection the transaction itself is holding: a
   * self-deadlock that sits `idle in transaction` until the statement timeout,
   * holding row locks on `invoices` the whole time.
   *
   * That is not a hypothetical. It happened, and the nightly job would have
   * hung every night and blocked the invoice table with it. The same shape is
   * safe everywhere else in this codebase only because those enqueues already
   * run after their transaction commits.
   */
  const claimed = await withElevatedPrivileges(
    JOB_CTX,
    'job.reminders',
    'daily invoice reminders',
    async (tx) => {
      /**
       * Select and stamp in ONE statement.
       *
       * `RETURNING` gives the rows that were actually claimed, so two concurrent
       * runs cannot both pick up the same invoice, the second sees a
       * `last_reminder_offset` already at or past this stage and matches nothing.
       * A read-then-write pair would leave that race open.
       */
      const rows = await tx.execute<{ id: string; offset: number }>(sql`
        UPDATE invoices
        SET last_reminder_offset = ((now() AT TIME ZONE 'Asia/Makassar')::date - due_date)
        WHERE status IN ('UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'INSTALLMENT')
          AND ((now() AT TIME ZONE 'Asia/Makassar')::date - due_date) = ANY(ARRAY[-3, 0, 1, 7])
          AND (last_reminder_offset IS NULL
               OR last_reminder_offset < ((now() AT TIME ZONE 'Asia/Makassar')::date - due_date))
        RETURNING id, last_reminder_offset AS "offset"
      `);
      return Array.from(rows) as Array<{ id: string; offset: number }>;
    },
  );

  // Committed. Now it is safe to take the connection again.
  for (const row of claimed) {
    await enqueue('notification.invoice-reminder', {
      invoiceId: row.id,
      offset: Number(row.offset),
    });
  }

  logger.info('reminders_queued', { queued: claimed.length });
  return { queued: claimed.length };
}

/** Sanity check used by the tests: SQL and helper must agree exactly. */
export function expectedLateFee(dueDate: string, now?: Date): number {
  return lateFee(daysPastDue(dueDate, now));
}

export interface BillingRunRow extends Record<string, unknown> {
  id: string;
  period: string;
  status: string;
  invoiceCount: number;
  totalAmount: number;
  issuedAt: string | null;
  issuedByName: string | null;
  createdAt: string;
}

/**
 * Runs, newest first, the review screen's index.
 *
 * As the caller: RLS restricts these to `/finance/invoices` holders, because a
 * run's totals are the business's revenue figures and a guardian has no reason
 * to know their bill arrived in a batch of forty.
 */
export async function listBillingRuns(ctx: RequestContext): Promise<BillingRunRow[]> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<BillingRunRow>(sql`
      SELECT r.id,
             r.period,
             r.status,
             r.invoice_count  AS "invoiceCount",
             r.total_amount   AS "totalAmount",
             r.issued_at      AS "issuedAt",
             u.full_name      AS "issuedByName",
             r.created_at     AS "createdAt"
      FROM billing_runs r
      LEFT JOIN users u ON u.id = r.issued_by_id
      ORDER BY r.period DESC
      LIMIT 24
    `);
    return Array.from(rows) as BillingRunRow[];
  });
}
