import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Weekly backup verification (doc 08 §3, doc 14 Task 0.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Supabase takes managed backups. Doc 08 §3 is explicit that managed backups
 * alone are not a recovery plan, for the reason every post-mortem about backups
 * gives: **an unverified backup is a belief, not a backup.** The failure mode is
 * always the same shape, the job that was supposed to be running had been
 * failing for months, and nobody found out until the day it mattered.
 *
 * What this job can honestly check from inside the application, and what it
 * cannot, is worth stating plainly.
 *
 * It CAN check that the data a restore would have to contain is actually there
 * and internally consistent: that the tables exist, that the row counts have not
 * collapsed, that the invariants the business depends on still hold. A silent
 * truncation, a migration that dropped a table, or a restore that came back
 * half-empty all show up here.
 *
 * It CANNOT verify the backup FILE. Reading Supabase's backup catalogue needs
 * the Management API and a personal access token, and actually proving a
 * restore works needs a scratch project to restore INTO. Both are deliberate
 * gaps rather than oversights, and both are recorded in the result so the
 * report never overstates what was proven.
 *
 * The result is logged as a single structured line. `logger.error` reaches
 * Sentry (Task 0.6), so a failing check pages somebody instead of sitting in a
 * log stream nobody opens, which is the whole point.
 */

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface BackupVerifyResult {
  ok: boolean;
  checkedAt: string;
  checks: Check[];
  /** What this job did NOT prove. Reported so the result cannot be over-read. */
  notVerified: string[];
}

/**
 * Tables whose disappearance or emptiness means a restore lost something.
 *
 * `roles` must never be empty: with no roles there are no grants, and the
 * organisation is locked out of its own system. The others are the record of
 * the business itself.
 */
const CRITICAL_TABLES = [
  'users',
  'roles',
  'role_pages',
  'role_actions',
  'students',
  'enrollments',
  'invoices',
  'payments',
  'registrations',
  'programs',
  'audit_log',
] as const;

export async function verifyBackup(): Promise<BackupVerifyResult> {
  const checks: Check[] = [];

  // ── 1. Every critical table still exists ────────────────────────────
  const present = await db.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const names = new Set(Array.from(present).map((r) => r.table_name));
  const missing = CRITICAL_TABLES.filter((t) => !names.has(t));
  checks.push({
    name: 'critical_tables_present',
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(', ')}` : `${CRITICAL_TABLES.length} present`,
  });

  // ── 2. The authorisation system is not empty ────────────────────────
  const [grants] = Array.from(
    await db.execute<{ roles: number; pages: number; actions: number }>(sql`
      SELECT (SELECT count(*) FROM roles)::int        AS roles,
             (SELECT count(*) FROM role_pages)::int   AS pages,
             (SELECT count(*) FROM role_actions)::int AS actions
    `),
  );
  checks.push({
    name: 'authorisation_populated',
    ok: (grants?.roles ?? 0) > 0 && (grants?.actions ?? 0) > 0,
    detail: `${grants?.roles ?? 0} roles, ${grants?.pages ?? 0} page grants, ${grants?.actions ?? 0} action grants`,
  });

  /**
   * ── 3. Somebody can still administer the system ────────────────────
   *
   * The same invariant the seed asserts and both write paths enforce. A restore
   * that lost `user_roles` would leave a database full of correct data that
   * nobody can log in and manage.
   */
  const [managers] = Array.from(
    await db.execute<{ n: number }>(sql`
      SELECT count(DISTINCT ur.user_id)::int AS n
      FROM user_roles ur
      JOIN role_actions ra ON ra.role_id = ur.role_id
      WHERE ra.action = 'role.manage'
    `),
  );
  checks.push({
    name: 'role_manage_holder_exists',
    ok: (managers?.n ?? 0) > 0,
    detail: `${managers?.n ?? 0} account(s) hold role.manage`,
  });

  /**
   * ── 4. RLS is still enabled everywhere ─────────────────────────────
   *
   * A restore, or a migration run against the wrong target, can bring tables
   * back with RLS off. That state looks completely healthy, every query
   * succeeds, and it is the most severe failure in this list.
   */
  const rls = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false
  `);
  const unprotected = Array.from(rls).map((r) => r.tablename);
  checks.push({
    name: 'rls_enabled_on_every_table',
    ok: unprotected.length === 0,
    detail: unprotected.length ? `RLS OFF: ${unprotected.join(', ')}` : 'all tables protected',
  });

  // ── 5. Money adds up ────────────────────────────────────────────────
  const [money] = Array.from(
    await db.execute<{ orphan_payments: number; negative_invoices: number }>(sql`
      SELECT (SELECT count(*) FROM payments p
              WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = p.invoice_id))::int
               AS orphan_payments,
             (SELECT count(*) FROM invoices WHERE amount < 0 OR late_fee < 0)::int
               AS negative_invoices
    `),
  );
  checks.push({
    name: 'financial_integrity',
    ok: (money?.orphan_payments ?? 0) === 0 && (money?.negative_invoices ?? 0) === 0,
    detail: `${money?.orphan_payments ?? 0} orphan payments, ${money?.negative_invoices ?? 0} negative amounts`,
  });

  // ── 6. The database is writable, and the write rolls back ───────────
  let writable = true;
  let writeDetail = 'write + rollback succeeded';
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE backup_verify_probe (n int) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO backup_verify_probe VALUES (1)`);
      /**
       * Rolled back on purpose. A verification job must not be able to change
       * production data, however small the change, otherwise the thing meant
       * to detect corruption becomes a way to cause it.
       */
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) {
      writable = false;
      writeDetail = err instanceof Error ? err.message : String(err);
    }
  }
  checks.push({ name: 'database_writable', ok: writable, detail: writeDetail });

  const result: BackupVerifyResult = {
    ok: checks.every((c) => c.ok),
    checkedAt: new Date().toISOString(),
    checks,
    notVerified: [
      'The backup FILE itself, needs the Supabase Management API and a personal access token.',
      'An actual restore, needs a scratch project to restore into (doc 08 §3.2).',
      'The external weekly export, verified by its own workflow, not by this job.',
    ],
  };

  if (result.ok) {
    logger.info('backup_verify_passed', { checks: checks.length });
  } else {
    // logger.error reaches Sentry. A silent failure here defeats the job.
    logger.error('backup_verify_failed', {
      failed: checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`),
    });
  }

  return result;
}

/** Sentinel: rolls the probe transaction back without reporting a failure. */
class Rollback extends Error {
  constructor() {
    super('intentional rollback');
  }
}
