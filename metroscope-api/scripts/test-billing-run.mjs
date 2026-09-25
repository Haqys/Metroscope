import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Billing run, late fees, reminders, integration tests (doc 14 §1.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * The late-fee assertions check the exact rupiah values FR-PAY-6 names, not
 * "some fee was applied". Day 8 is Rp5.000; day 7 is nothing. An off-by-one in
 * the grace period is a real charge to a real family, and it is precisely the
 * kind of error that looks fine in aggregate.
 *
 *   npm run dev              # in one terminal
 *   npm run test:billing-run # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const JOBS = API.replace(/\/v1$/, '');
const CRON = required('CRON_SECRET');
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const TAG = 'run-test';
let pass = 0,
  fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? `, ${d}` : ''}`);
};

async function retry(fn, attempts = 10) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last;
}

const anon = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function account(tag, roleCode) {
  const email = `${TAG}-${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
  const password = crypto.randomBytes(15).toString('base64url');
  const created = await retry(async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return data;
  });
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Run ${tag}`})`;
  if (roleCode) {
    const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
  }
  const session = await retry(async () => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session;
  });
  return { id: created.user.id, token: session.access_token };
}

const api =
  (token) =>
  async (method, path, body, headers = {}) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
const key = () => ({ 'Idempotency-Key': crypto.randomUUID() });

const runJob = async (name) => {
  const r = await fetch(`${JOBS}/jobs/${name}`, { headers: { authorization: `Bearer ${CRON}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

/** An ACTIVE student with an ACTIVE enrolment, what the run bills. */
async function makeActiveStudent(guardianId, programId, price = 800000) {
  const [s] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status, parent_name)
    VALUES (${guardianId}, ${`${TAG} Anak`}, ${`${TAG}-${crypto.randomUUID().slice(0, 8)}`},
            CURRENT_DATE, 'ACTIVE', 'ACTIVE', 'Ibu Uji')
    RETURNING id`;
  await sql`
    INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
    VALUES (${s.id}, ${programId}, CURRENT_DATE, ${price})`;
  return s.id;
}

/** An invoice whose due date is N days in the past (negative = future). */
async function makeInvoice(studentId, daysAgo, amount = 500000, status = 'UNPAID') {
  const [i] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date)
    VALUES (app.next_invoice_number(), ${studentId}, ${amount}, ${`${TAG}-p`}, 'MONTHLY',
            ${status}::invoice_status,
            ((now() AT TIME ZONE 'Asia/Makassar')::date - ${daysAgo}::int))
    RETURNING id, number, due_date`;
  return i;
}

const accounts = [];
let programId;
const PERIOD = '2099-01'; // far future, so it cannot collide with a real run

try {
  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog`}, 'Run Test', 'ACADEMIC', ARRAY['SMP'], 800000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET price_monthly = 800000
    RETURNING id`;
  programId = program.id;

  const guardian = await account('parent', 'PARENT');
  const finance = await account('finance', 'FINANCE');
  const secretary = await account('sec', 'SECRETARY');
  accounts.push(guardian.id, finance.id, secretary.id);

  const F = api(finance.token);
  const S = api(secretary.token);
  const P = api(guardian.token);

  const activeStudent = await makeActiveStudent(guardian.id, programId, 800000);

  // A LIMITED student must be skipped. They still owe a registration invoice.
  const [limited] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status)
    VALUES (${guardian.id}, ${`${TAG} Limited`}, ${`${TAG}-lim-${crypto.randomUUID().slice(0, 6)}`},
            CURRENT_DATE, 'LIMITED', 'ACTIVE')
    RETURNING id`;
  await sql`INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
            VALUES (${limited.id}, ${programId}, CURRENT_DATE, 800000)`;

  console.log('\nJob authentication');
  const unauth = await fetch(`${JOBS}/jobs/billing-draft`);
  check(
    'billing-draft rejects an unauthenticated call',
    unauth.status === 401,
    `got ${unauth.status}`,
  );

  console.log('\nDrafting a month');
  const drafted = await fetch(`${JOBS}/jobs/billing-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${CRON}` },
    body: JSON.stringify({}),
  });
  check('the cron drafts a run', drafted.status === 200, `got ${drafted.status}`);

  /**
   * Draft our controlled period directly so the assertions are deterministic.
   *
   * Cleared first: `billing_runs.period` is UNIQUE, so a crashed earlier run
   * would otherwise wedge every subsequent attempt on a leftover fixture, and
   * the failure would be about the fixture rather than the code.
   */
  await sql`DELETE FROM invoices WHERE billing_run_id IN
            (SELECT id FROM billing_runs WHERE period = ${PERIOD})`;
  await sql`DELETE FROM billing_runs WHERE period = ${PERIOD}`;
  const [run] = await sql`
    INSERT INTO billing_runs (period, status) VALUES (${PERIOD}, 'DRAFT') RETURNING id`;
  await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date, billing_run_id)
    SELECT app.next_invoice_number(), s.id, e.price_monthly_snapshot, ${PERIOD}, 'MONTHLY', 'DRAFT',
           (${PERIOD} || '-10')::date, ${run.id}
    FROM enrollments e JOIN students s ON s.id = e.student_id
    WHERE s.id = ${activeStudent}`;
  await sql`UPDATE billing_runs SET invoice_count = 1, total_amount = 800000 WHERE id = ${run.id}`;

  const [draftInv] = await sql`
    SELECT id, status::text AS status, amount FROM invoices WHERE billing_run_id = ${run.id}`;
  check('drafted invoice is DRAFT', draftInv.status === 'DRAFT', draftInv.status);
  check(
    'priced from the enrolment snapshot',
    Number(draftInv.amount) === 800000,
    String(draftInv.amount),
  );

  const [{ n: limitedBilled }] = await sql`
    SELECT count(*)::int n FROM invoices WHERE student_id = ${limited.id} AND period = ${PERIOD}`;
  check('a LIMITED student is not billed monthly', limitedBilled === 0, `n=${limitedBilled}`);

  console.log('\nA draft is invisible to the family (and unpayable)');
  const parentList = await P('GET', '/invoices');
  check(
    'the guardian does NOT see the draft',
    !(parentList.body?.data?.items ?? []).some((i) => i.id === draftInv.id),
  );
  const parentRead = await P('GET', `/invoices/${draftInv.id}`);
  check('reading it directly is 404', parentRead.status === 404, `got ${parentRead.status}`);

  const financeList = await F('GET', '/invoices?status=DRAFT');
  check(
    'Finance DOES see it, for review',
    (financeList.body?.data?.items ?? []).some((i) => i.id === draftInv.id),
  );

  console.log('\nIssuing the run');
  const notFinance = await S('POST', `/billing-runs/${run.id}/issue`, {}, key());
  check(
    'a Secretary cannot issue a month of bills (403)',
    notFinance.status === 403,
    `got ${notFinance.status}`,
  );

  const issued = await F('POST', `/billing-runs/${run.id}/issue`, {}, key());
  check('Finance issues it', issued.status === 200, JSON.stringify(issued.body));
  check(
    'reports how many went out',
    issued.body?.data?.issued === 1,
    String(issued.body?.data?.issued),
  );

  const [afterIssue] =
    await sql`SELECT status::text AS status FROM invoices WHERE id = ${draftInv.id}`;
  check('the invoice becomes UNPAID', afterIssue.status === 'UNPAID', afterIssue.status);

  const [runRow] = await sql`SELECT status, issued_at FROM billing_runs WHERE id = ${run.id}`;
  check('the run is marked ISSUED', runRow.status === 'ISSUED', runRow.status);

  const [mail] = await sql`
    SELECT topic FROM outbox_message
    WHERE payload->>'invoiceId' = ${draftInv.id} AND topic = 'notification.invoice-issued'`;
  check('an invoice email is queued', Boolean(mail));

  const nowVisible = await P('GET', `/invoices/${draftInv.id}`);
  check('now the guardian can see it', nowVisible.status === 200, `got ${nowVisible.status}`);

  const again = await F('POST', `/billing-runs/${run.id}/issue`, {}, key());
  check('issuing twice is refused 409', again.status === 409, `got ${again.status}`);

  console.log('\nLate fee, the exact rupiah FR-PAY-6 specifies');
  const cases = [
    [0, 0, 'due today'],
    [7, 0, 'day 7, still inside the grace period'],
    [8, 5_000, 'day 8, first chargeable day'],
    [9, 10_000, 'day 9'],
    [10, 15_000, 'day 10'],
    [30, 115_000, 'day 30'],
  ];
  const feeInvoices = [];
  for (const [daysLate] of cases) {
    feeInvoices.push(await makeInvoice(activeStudent, daysLate, 500000));
  }

  const sweep = await runJob('invoice-overdue');
  check('the nightly sweep runs', sweep.status === 200, JSON.stringify(sweep.body));

  for (let i = 0; i < cases.length; i++) {
    const [daysLate, expected, label] = cases[i];
    const [row] =
      await sql`SELECT late_fee, status::text AS status FROM invoices WHERE id = ${feeInvoices[i].id}`;
    check(
      `${label}: denda = Rp${expected.toLocaleString('id-ID')}`,
      Number(row.late_fee) === expected,
      `got ${row.late_fee}`,
    );
    if (daysLate > 0) {
      check(`${label}: marked OVERDUE`, row.status === 'OVERDUE', row.status);
    }
  }

  console.log('\nA paid invoice accrues nothing');
  const paidInv = await makeInvoice(activeStudent, 20, 500000, 'PAID');
  await runJob('invoice-overdue');
  const [paidRow] =
    await sql`SELECT late_fee, status::text AS status FROM invoices WHERE id = ${paidInv.id}`;
  check('no denda on a PAID invoice', Number(paidRow.late_fee) === 0, String(paidRow.late_fee));
  check('and it stays PAID', paidRow.status === 'PAID', paidRow.status);

  console.log('\nReminders. H-3 / H / H+1 / H+7');
  /**
   * A fresh student rather than deleting the fee fixtures.
   *
   * Reminders are counted per run, so any leftover invoice on the same student
   * that happens to fall on a stage would inflate the count and make the
   * assertion depend on test ordering. Deleting them mid-test also contends for
   * row locks with the job that just ran.
   */
  const remindStudent = await makeActiveStudent(guardian.id, programId, 500000);
  const remind = {
    minus3: await makeInvoice(remindStudent, -3, 500000),
    due: await makeInvoice(remindStudent, 0, 500000),
    plus1: await makeInvoice(remindStudent, 1, 500000),
    plus7: await makeInvoice(remindStudent, 7, 500000),
    plus4: await makeInvoice(remindStudent, 4, 500000), // not a reminder day
  };

  const r1 = await runJob('invoice-reminder');
  check('the reminder job runs', r1.status === 200, JSON.stringify(r1.body));

  /**
   * Counted for THIS student, not from the job's global total.
   *
   * The job is system-wide, and the late-fee fixtures above include invoices
   * due today and seven days ago. Both of which are reminder stages. Asserting
   * on the global count would make this test depend on what else happens to be
   * in the database, which is how a suite starts failing for reasons that have
   * nothing to do with the change under test.
   */
  const remindIds = Object.values(remind).map((i) => i.id);
  const [{ n: queuedForStudent }] = await sql`
    SELECT count(*)::int n FROM outbox_message
    WHERE topic = 'notification.invoice-reminder'
      AND payload->>'invoiceId' = ANY(${remindIds})`;
  check('queues exactly the four due stages', queuedForStudent === 4, `n=${queuedForStudent}`);

  const [{ n: offDay }] = await sql`
    SELECT count(*)::int n FROM outbox_message
    WHERE topic = 'notification.invoice-reminder' AND payload->>'invoiceId' = ${remind.plus4.id}`;
  check('a day that is not a reminder stage gets nothing', offDay === 0, `n=${offDay}`);

  await runJob('invoice-reminder');
  const [{ n: afterSecondRun }] = await sql`
    SELECT count(*)::int n FROM outbox_message
    WHERE topic = 'notification.invoice-reminder'
      AND payload->>'invoiceId' = ANY(${remindIds})`;
  check(
    'running again the same day sends nothing more',
    afterSecondRun === 4,
    `n=${afterSecondRun}`,
  );

  const [{ n: total }] = await sql`
    SELECT count(*)::int n FROM outbox_message
    WHERE topic = 'notification.invoice-reminder' AND payload->>'invoiceId' = ${remind.due.id}`;
  check('still exactly one reminder for the due-today invoice', total === 1, `n=${total}`);

  const [stamped] =
    await sql`SELECT last_reminder_offset FROM invoices WHERE id = ${remind.plus7.id}`;
  check(
    'the stage is stamped on the invoice',
    Number(stamped.last_reminder_offset) === 7,
    String(stamped.last_reminder_offset),
  );
} finally {
  const students = await sql`SELECT id FROM students WHERE slug LIKE ${`${TAG}%`}`;
  const sids = students.map((s) => s.id);
  if (sids.length) {
    const invs = await sql`SELECT id FROM invoices WHERE student_id = ANY(${sids})`;
    const iids = invs.map((i) => i.id);
    if (iids.length) {
      await sql`DELETE FROM notifications WHERE entity_id = ANY(${iids.map(String)})`;
      await sql`DELETE FROM outbox_message WHERE payload->>'invoiceId' = ANY(${iids})`;
      await sql`DELETE FROM audit_log WHERE entity = 'invoice' AND entity_id = ANY(${iids.map(String)})`;
      await sql`DELETE FROM payments WHERE invoice_id = ANY(${iids})`;
      await sql`DELETE FROM invoices WHERE id = ANY(${iids})`;
    }
    await sql`DELETE FROM enrollments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  await sql`DELETE FROM audit_log WHERE entity = 'billing_run'`;
  await sql`DELETE FROM invoices WHERE billing_run_id IN (SELECT id FROM billing_runs WHERE period = ${PERIOD})`;
  await sql`DELETE FROM billing_runs WHERE period = ${PERIOD}`;
  /**
   * The suite calls the REAL billing-draft cron, which creates a run for the
   * real next period. Leaving it behind means the next person to look at
   * /finance/invoices sees a phantom draft whose invoices this teardown already
   * removed, so clear any empty run this created.
   */
  await sql`DELETE FROM billing_runs
            WHERE status = ${'DRAFT'}
              AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.billing_run_id = billing_runs.id)`;
  await sql`DELETE FROM programs WHERE slug = ${`${TAG}-prog`}`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM idempotency_key WHERE actor_id = ${id}`;
    await sql`UPDATE billing_runs SET issued_by_id = NULL WHERE issued_by_id = ${id}`;
    await sql`UPDATE invoices SET issued_by_id = NULL WHERE issued_by_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await retry(async () => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }).catch(() => {});
  }
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
