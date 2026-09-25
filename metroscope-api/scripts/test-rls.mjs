import crypto from 'node:crypto';
import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RLS allow/deny tests, doc 14 §0.2 exit criterion.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These deliberately bypass the API. Every request goes straight to Postgres as
 * `authenticated` with forged JWT claims, exactly as lib/db/rls.ts does. That is
 * the point: handler({ action }) is Gate 2 and it is not running here, so
 * anything that passes proves the DATABASE refused, not that the API did.
 *
 * Each case asserts both directions. A policy that denies everything passes
 * every deny test and is still broken, so every table with a deny case also has
 * the matching allow case.
 *
 * Fixtures are created on the owner connection, prefixed rls-test-, and removed
 * in a finally block whether or not the run succeeds.
 */

const TAG = 'rls-test';
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  [32mPASS[0m  ${name}`);
  } else {
    fail++;
    console.log(`  [31mFAIL[0m  ${name}${detail ? `, ${detail}` : ''}`);
  }
}

/** Run fn as `authenticated` with these claims, then roll back. */
async function asUser(sql, userId, fn) {
  let out;
  await sql
    .begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: userId })}', true)`,
      );
      await tx.unsafe('SET LOCAL ROLE authenticated');
      out = await fn(tx);
      // Always roll back: tests must not leave rows behind, and a write that
      // succeeded is still proof the policy allowed it.
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return out;
}

class Rollback extends Error {}

/** Expect a statement to be refused. Returns true when it was. */
async function denied(sql, userId, fn) {
  try {
    const rows = await asUser(sql, userId, fn);
    // A SELECT that returns nothing is a denial; a write that returns is not.
    return Array.isArray(rows) ? rows.length === 0 : false;
  } catch (err) {
    if (err instanceof Rollback) return false;
    return true; // raised, insufficient_privilege, policy violation, trigger
  }
}

async function main() {
  loadEnvLocal();
  const sql = postgres(required('DIRECT_URL'), { max: 1, connect_timeout: 15 });

  const ids = {
    parentA: crypto.randomUUID(),
    parentB: crypto.randomUUID(),
    mentor: crypto.randomUUID(),
    finance: crypto.randomUUID(),
    studentA: null,
    studentB: null,
    invoiceA: null,
    program: null,
  };

  try {
    // ── fixtures (owner connection, bypasses RLS) ──────────────────────
    const [{ id: mentorRole }] = await sql`SELECT id FROM roles WHERE code = 'MENTOR'`;
    const [{ id: financeRole }] = await sql`SELECT id FROM roles WHERE code = 'FINANCE'`;

    for (const [key, name] of [
      ['parentA', 'RLS Test Parent A'],
      ['parentB', 'RLS Test Parent B'],
      ['mentor', 'RLS Test Mentor'],
      ['finance', 'RLS Test Finance'],
    ]) {
      await sql`
        INSERT INTO users (id, email, full_name)
        VALUES (${ids[key]}, ${`${TAG}-${key}@example.test`}, ${name})
      `;
    }
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${ids.mentor}, ${mentorRole})`;
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${ids.finance}, ${financeRole})`;

    const [program] = await sql`
      INSERT INTO programs (slug, name, category, levels, price_monthly, status)
      VALUES (${`${TAG}-program`}, 'RLS Test Program', 'ACADEMIC', ARRAY['SMP'], 500000, 'PUBLISHED')
      RETURNING id`;
    ids.program = program.id;

    for (const [key, parent] of [
      ['studentA', 'parentA'],
      ['studentB', 'parentB'],
    ]) {
      const [s] = await sql`
        INSERT INTO students (user_id, name, slug, join_date, account_status)
        VALUES (${ids[parent]}, ${`RLS ${key}`}, ${`${TAG}-${key}`}, CURRENT_DATE, 'ACTIVE')
        RETURNING id`;
      ids[key] = s.id;
    }

    const [inv] = await sql`
      INSERT INTO invoices (number, student_id, amount, period, type, status, due_date)
      VALUES (${`${TAG}-INV-1`}, ${ids.studentA}, 750000, '2026-07', 'MONTHLY', 'UNPAID', CURRENT_DATE)
      RETURNING id`;
    ids.invoiceA = inv.id;

    // ── the two cases doc 14 names explicitly ──────────────────────────
    console.log('\nTenant isolation. One family must not see another');

    const own = await asUser(
      sql,
      ids.parentA,
      (tx) => tx`SELECT id FROM students WHERE id = ${ids.studentA}`,
    );
    check('parent A reads their own student', own.length === 1);

    const other = await asUser(
      sql,
      ids.parentA,
      (tx) => tx`SELECT id FROM students WHERE id = ${ids.studentB}`,
    );
    check("parent A cannot read parent B's student", other.length === 0);

    const otherInv = await asUser(
      sql,
      ids.parentA,
      (tx) => tx`SELECT id FROM invoices WHERE student_id = ${ids.studentB}`,
    );
    check("parent A cannot read parent B's invoices", otherInv.length === 0);

    const ownInv = await asUser(
      sql,
      ids.parentA,
      (tx) => tx`SELECT id FROM invoices WHERE id = ${ids.invoiceA}`,
    );
    check('parent A reads their own invoice', ownInv.length === 1);

    console.log('\nMoney, a Mentor must not be able to write an invoice');

    check(
      'mentor cannot INSERT an invoice',
      await denied(
        sql,
        ids.mentor,
        (tx) =>
          tx`INSERT INTO invoices (number, student_id, amount, period, type, due_date)
           VALUES (${`${TAG}-EVIL`}, ${ids.studentA}, 1, '2026-07', 'MONTHLY', CURRENT_DATE)
           RETURNING id`,
      ),
    );

    check(
      'mentor cannot mark an invoice PAID',
      await denied(
        sql,
        ids.mentor,
        (tx) => tx`UPDATE invoices SET status = 'PAID' WHERE id = ${ids.invoiceA} RETURNING id`,
      ),
    );

    check(
      'mentor cannot record a payment',
      await denied(
        sql,
        ids.mentor,
        (tx) =>
          tx`INSERT INTO payments (invoice_id, gross_amount) VALUES (${ids.invoiceA}, 750000) RETURNING id`,
      ),
    );

    const financeWrite = await asUser(
      sql,
      ids.finance,
      (tx) => tx`UPDATE invoices SET status = 'PAID' WHERE id = ${ids.invoiceA} RETURNING id`,
    );
    check('finance CAN settle an invoice', financeWrite.length === 1);

    console.log('\nColumn guard, a parent may attach proof, not change the bill');

    const proof = await asUser(
      sql,
      ids.parentA,
      (tx) =>
        tx`UPDATE invoices SET proof_key = 'proofs/x.jpg', proof_uploaded_at = now()
         WHERE id = ${ids.invoiceA} RETURNING id`,
    );
    check('parent CAN attach a transfer proof', proof.length === 1);

    check(
      'parent cannot mark their own invoice PAID',
      await denied(
        sql,
        ids.parentA,
        (tx) => tx`UPDATE invoices SET status = 'PAID' WHERE id = ${ids.invoiceA} RETURNING id`,
      ),
    );

    check(
      'parent cannot reduce their own invoice amount',
      await denied(
        sql,
        ids.parentA,
        (tx) => tx`UPDATE invoices SET amount = 1 WHERE id = ${ids.invoiceA} RETURNING id`,
      ),
    );

    /**
     * The one status transition a guardian may make (FR-PAY-2), and the one they
     * would most like to make instead.
     *
     * These two are a pair on purpose: the guard has to permit exactly one move
     * and refuse the rest. A version of it that returned early for everyone
     * passed every deny test in this file except these, which is how that
     * regression was caught, so they are worth keeping adjacent.
     */
    const submitted = await asUser(
      sql,
      ids.parentA,
      (tx) =>
        tx`UPDATE invoices SET proof_key = 'proofs/a.jpg', proof_uploaded_at = now(),
             status = 'AWAITING_VERIFICATION'
           WHERE id = ${ids.invoiceA} RETURNING id`,
    );
    check('parent CAN submit a transfer proof for verification', submitted.length === 1);

    check(
      'but cannot skip the queue by claiming AWAITING_VERIFICATION with no proof',
      await denied(
        sql,
        ids.parentA,
        (tx) =>
          tx`UPDATE invoices SET status = 'AWAITING_VERIFICATION', proof_key = NULL
             WHERE id = ${ids.invoiceA} RETURNING id`,
      ),
    );

    console.log('\nPrivilege escalation, grants must not be self-serve');

    check(
      'mentor cannot grant themselves payment.verify',
      await denied(
        sql,
        ids.mentor,
        (tx) =>
          tx`INSERT INTO role_actions (role_id, action)
           VALUES (${mentorRole}, 'payment.verify') RETURNING action`,
      ),
    );

    check(
      'mentor cannot assign themselves another role',
      await denied(
        sql,
        ids.mentor,
        (tx) =>
          tx`INSERT INTO user_roles (user_id, role_id)
           VALUES (${ids.mentor}, ${financeRole}) RETURNING role_id`,
      ),
    );

    check(
      'mentor cannot read the audit log',
      await denied(sql, ids.mentor, (tx) => tx`SELECT id FROM audit_log LIMIT 1`),
    );

    console.log('\nSystem tables, unreachable by any session');

    /**
     * Seed a row into each first. Both tables are normally empty, so asserting
     * "returns 0 rows" against an empty table would pass with RLS switched off
     * entirely, a test that proves nothing. The owner writes one row, then the
     * session must still see none.
     */
    await sql`
      INSERT INTO idempotency_key (key, scope, status, response)
      VALUES (${`${TAG}-key`}, ${`${TAG}-scope`}, 200, '{}'::jsonb)`;
    await sql`
      INSERT INTO outbox_message (topic, payload)
      VALUES (${`${TAG}.topic`}, '{}'::jsonb)`;

    const [{ n: idemRows }] = await sql`SELECT count(*)::int n FROM idempotency_key`;
    const [{ n: outboxRows }] = await sql`SELECT count(*)::int n FROM outbox_message`;
    check(
      'fixture visible to the owner (guards against a vacuous test)',
      idemRows > 0 && outboxRows > 0,
      `idempotency_key=${idemRows} outbox_message=${outboxRows}`,
    );

    check(
      'authenticated cannot read idempotency_key',
      await denied(sql, ids.finance, (tx) => tx`SELECT key FROM idempotency_key LIMIT 1`),
    );

    check(
      'authenticated cannot read the outbox',
      await denied(sql, ids.finance, (tx) => tx`SELECT id FROM outbox_message LIMIT 1`),
    );

    console.log('\nNotifications addressed to non-accounts');

    /**
     * notifications.user_id became nullable so lead confirmations can be
     * recorded before conversion creates an account. The SELECT policy compares
     * user_id to the caller, and NULL = uuid is NULL rather than true, so these
     * rows should be invisible to everyone. Asserting it, because "nullable
     * column silently widens a policy" is a classic way to leak.
     */
    await sql`
      INSERT INTO notifications (user_id, recipient_email, channel, template, entity_type, entity_id)
      VALUES (NULL, ${`${TAG}@example.test`}, 'EMAIL', 'lead.received', 'registration', ${ids.studentA})`;

    const [{ n: ownerSees }] = await sql`
      SELECT count(*)::int n FROM notifications WHERE recipient_email = ${`${TAG}@example.test`}`;
    check('fixture exists for the owner', ownerSees === 1, `n=${ownerSees}`);

    check(
      'a prospect-addressed notification is invisible to a signed-in user',
      await denied(
        sql,
        ids.parentA,
        (tx) => tx`SELECT id FROM notifications WHERE recipient_email = ${`${TAG}@example.test`}`,
      ),
    );
    check(
      'and invisible to staff too',
      await denied(
        sql,
        ids.finance,
        (tx) => tx`SELECT id FROM notifications WHERE recipient_email = ${`${TAG}@example.test`}`,
      ),
    );

    console.log('\nAnonymous reach');

    const anonPrograms = await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE anon');
      return tx`SELECT id FROM programs WHERE id = ${ids.program}`;
    });
    check('anon reads a PUBLISHED program', anonPrograms.length === 1);

    await sql`UPDATE programs SET status = 'DRAFT' WHERE id = ${ids.program}`;
    const anonDraft = await sql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE anon');
      return tx`SELECT id FROM programs WHERE id = ${ids.program}`;
    });
    check('anon cannot read an UNPUBLISHED program', anonDraft.length === 0);

    /**
     * Two gates now, and this passes on either.
     *
     * It used to return zero rows. RLS filtering a read rather than raising.
     * Migration 0024 revoked the blanket grant Supabase's default ACL had given
     * `anon` on every table in `public`, so the same query is refused before a
     * policy is consulted. "Anon cannot read students" is the property; which
     * gate says no is not.
     */
    const anonStudents = await sql
      .begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE anon');
        return tx`SELECT id FROM students LIMIT 1`;
      })
      .catch((e) => (e.code === '42501' ? 'denied' : Promise.reject(e)));
    check(
      'anon cannot read students at all',
      anonStudents === 'denied' || anonStudents.length === 0,
    );
  } finally {
    // ── teardown ───────────────────────────────────────────────────────
    await sql`DELETE FROM notifications WHERE recipient_email LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM idempotency_key WHERE key LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM outbox_message WHERE topic LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE number LIKE ${`${TAG}%`})`;
    await sql`DELETE FROM invoices WHERE number LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM students WHERE slug LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM programs WHERE slug LIKE ${`${TAG}%`}`;
    await sql`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE ${`${TAG}%`})`;
    await sql`DELETE FROM users WHERE email LIKE ${`${TAG}%`}`;
    await sql.end({ timeout: 5 });
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nRLS tests errored:', err.message);
  process.exit(1);
});
