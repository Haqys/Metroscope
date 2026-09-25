import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import type { RequestContext } from '@/lib/auth/context';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RLS ENFORCEMENT, the most important file in this service.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The brief requires permissions enforced by BOTH the API and Supabase RLS.
 * That only holds if RLS actually runs.
 *
 * If the API connected with the service role, Postgres would treat it as a
 * superuser and EVERY policy would be silently bypassed, the team would write,
 * review and test policies that never execute. That is worse than having none,
 * because it manufactures confidence without protection (doc 04 §0.3).
 *
 * So: normal request work runs inside a transaction that assumes the CALLER's
 * identity. `request.jwt.claims` is what `auth.uid()` and our `has_action()` /
 * `has_page()` helpers read, and `SET LOCAL ROLE authenticated` drops the
 * superuser bit for the remainder of the transaction.
 *
 * Both settings are transaction-local (`true` / `LOCAL`), so they cannot leak
 * to the next request sharing the pooled connection.
 */
export async function asUser<T>(
  ctx: RequestContext,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!ctx.user) {
    throw new Error('asUser() requires an authenticated context. Use asAnon() for public reads.');
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(ctx.claims)}, true)`,
    );
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    return fn(tx);
  });
}

/** Public reads (published articles, programs, competition calendar). RLS active. */
export async function asAnon<T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE anon`);
    return fn(tx);
  });
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PRIVILEGED ESCAPE HATCH, enumerated, audited, never the default.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A handful of operations genuinely cannot run as the caller: provisioning a
 * user who does not exist yet, cron jobs with no caller at all, webhook
 * reconciliation, administrative repair.
 *
 * Every one is listed here. Adding to this list is a security change and must
 * be reviewed as one. Anything not on the list cannot elevate, the call throws.
 */
const PRIVILEGED_OPERATIONS = [
  'user.provision', // conversion creates a User before any session exists
  /**
   * Verifying a payment activates the student's account (FR-ENR-5), which writes
   * to `students`, a table Finance can read but holds no `student.edit` grant
   * for, and should not, because that grant also allows editing the academic
   * record. The alternative was to widen Finance's grants permanently so one
   * column could be flipped; this keeps the widening scoped to the operation
   * that needs it, and audited.
   */
  'payment.settle',
  'job.billing-run',
  'job.invoice-overdue',
  'job.reminders',
  'job.assessment-coverage',
  'job.content-publish',
  'job.outbox-dispatch',
  'webhook.reconcile',
  /**
   * Rendering an unpublished page for a signed preview link (doc 13 §9.5).
   *
   * Elevated because the whole point is to show what `anon` may not see. The
   * widening is bounded three ways before this runs: the caller presented a
   * token that matched a stored SHA-256, the grant names ONE entity id, and it
   * has not expired. Without elevation the alternative is a policy letting
   * `anon` read drafts under some condition, a permanent hole to serve a
   * temporary link.
   */
  'preview.redeem',
  /**
   * Storing a contact message from the public website (doc 13 §9.4).
   *
   * `anon` deliberately has NO insert policy on `form_submissions`, a table
   * the public can write through its own grant is one it can be induced to
   * write through PostgREST directly, bypassing the rate limit and the
   * honeypot. The elevation writes one row of one shape from a body Zod has
   * already validated, and the endpoint returns nothing but an acknowledgement.
   */
  'form.submit',
  'admin.repair',
] as const;

export type PrivilegedOperation = (typeof PRIVILEGED_OPERATIONS)[number];

/**
 * Run with elevated privileges. RLS does not apply inside, the callback is
 * therefore responsible for its own scoping, and every use is audited.
 */
export async function withElevatedPrivileges<T>(
  ctx: RequestContext,
  operation: PrivilegedOperation,
  reason: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!PRIVILEGED_OPERATIONS.includes(operation)) {
    throw new Error(
      `Refusing to elevate: "${operation}" is not an enumerated privileged operation.`,
    );
  }

  logger.warn('privilege_elevated', {
    operation,
    reason,
    requestId: ctx.requestId,
    userId: ctx.user?.id ?? 'system',
  });

  return db.transaction(async (tx) => {
    // No role switch: the pooled connection's own role is used. Keep the unit
    // of work as small as possible.
    const result = await fn(tx);

    await tx.execute(sql`
      INSERT INTO audit_log (actor_id, action, entity, entity_id, meta, ip, user_agent)
      VALUES (
        ${ctx.user?.id ?? null},
        ${`privileged.${operation}`},
        'system',
        NULL,
        ${JSON.stringify({ reason, requestId: ctx.requestId })}::jsonb,
        ${ctx.ip},
        ${ctx.userAgent}
      )
    `);

    return result;
  });
}
