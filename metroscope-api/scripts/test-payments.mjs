import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Payment & verification, integration tests (doc 14 §1.5 / FR-PAY-2..5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * The assertions are mostly about what must NOT happen: a guardian marking
 * their own invoice paid, a Mentor verifying money, a proof being pointed at
 * someone else's bill, a double approval recording the settlement twice.
 *
 *   npm run dev           # in one terminal
 *   npm run test:payments # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const TAG = 'pay-test';
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

/** An account with an optional staff role. No role = a customer. */
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Pay ${tag}`})`;
  if (roleCode) {
    const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
    await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
  }
  const session = await retry(async () => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session;
  });
  return { id: created.user.id, email, token: session.access_token };
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

/** A LIMITED student with an unpaid registration invoice, as conversion leaves it. */
async function makeBilledStudent(guardianId, programId, amount = 750000) {
  const [student] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, parent_name)
    VALUES (${guardianId}, ${`${TAG} Anak`}, ${`${TAG}-${crypto.randomUUID().slice(0, 8)}`},
            CURRENT_DATE, 'LIMITED', 'Ibu Uji')
    RETURNING id`;
  await sql`
    INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
    VALUES (${student.id}, ${programId}, CURRENT_DATE, ${amount})`;
  const [invoice] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date)
    VALUES (app.next_invoice_number(), ${student.id}, ${amount}, '2026-07', 'REGISTRATION',
            'UNPAID', CURRENT_DATE + interval '7 days')
    RETURNING id, number`;
  return { studentId: student.id, invoiceId: invoice.id, number: invoice.number };
}

const accounts = [];
let programId;

try {
  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog`}, 'Bayar Test', 'ACADEMIC', ARRAY['SMP'], 750000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET price_monthly = 750000
    RETURNING id`;
  programId = program.id;

  const parentA = await account('parentA');
  const parentB = await account('parentB');
  const finance = await account('finance', 'FINANCE');
  const mentor = await account('mentor', 'MENTOR');
  accounts.push(parentA.id, parentB.id, finance.id, mentor.id);

  const A = api(parentA.token);
  const B = api(parentB.token);
  const F = api(finance.token);
  const M = api(mentor.token);

  const billA = await makeBilledStudent(parentA.id, programId);
  const billB = await makeBilledStudent(parentB.id, programId);

  console.log('\nVisibility');
  const ownList = await A('GET', '/invoices');
  check(
    'a guardian sees their own invoice',
    ownList.status === 200 &&
      (ownList.body?.data?.items ?? []).some((i) => i.id === billA.invoiceId),
  );
  check(
    "and NOT another family's",
    !(ownList.body?.data?.items ?? []).some((i) => i.id === billB.invoiceId),
  );

  const crossRead = await A('GET', `/invoices/${billB.invoiceId}`);
  check(
    "reading another family's invoice is 404, not 403",
    crossRead.status === 404,
    `got ${crossRead.status}`,
  );

  const financeList = await F('GET', '/invoices');
  check(
    'Finance sees both families',
    financeList.status === 200 && (financeList.body?.data?.items ?? []).length >= 2,
  );

  console.log('\nA guardian cannot pay their own bill by saying so');
  const selfPaid = await A('POST', `/invoices/${billA.invoiceId}/verify`, {}, key());
  check('guardian cannot verify (403)', selfPaid.status === 403, `got ${selfPaid.status}`);

  const mentorVerify = await M('POST', `/invoices/${billA.invoiceId}/verify`, {}, key());
  check(
    'a Mentor cannot verify money (403)',
    mentorVerify.status === 403,
    `got ${mentorVerify.status}`,
  );

  const [stillUnpaid] = await sql`SELECT status FROM invoices WHERE id = ${billA.invoiceId}`;
  check(
    'invoice untouched by refused attempts',
    stillUnpaid.status === 'UNPAID',
    stillUnpaid.status,
  );

  console.log('\nProof upload (FR-PAY-2)');
  const urlRes = await A('POST', `/invoices/${billA.invoiceId}/proof-url`, {
    filename: 'transfer.jpg',
    contentType: 'image/jpeg',
  });
  check(
    'guardian gets a signed upload URL',
    urlRes.status === 200 && Boolean(urlRes.body?.data?.uploadUrl),
    JSON.stringify(urlRes.body).slice(0, 160),
  );
  check(
    'the key is namespaced to their own invoice',
    String(urlRes.body?.data?.proofKey ?? '').startsWith(`${billA.studentId}/${billA.invoiceId}/`),
    urlRes.body?.data?.proofKey,
  );
  check('max size is 2 MB (FR-PAY-2)', urlRes.body?.data?.maxBytes === 2 * 1024 * 1024);

  const proofKey = urlRes.body.data.proofKey;

  const confirmEarly = await A('POST', `/invoices/${billA.invoiceId}/proof`, { proofKey });
  check(
    'confirming before the file exists is refused 422',
    confirmEarly.status === 422,
    `got ${confirmEarly.status}`,
  );

  // Upload a real object through the signed URL, as the browser would.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const up = await fetch(urlRes.body.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: png,
  });
  check('the signed URL accepts the upload', up.ok, `status ${up.status}`);

  const confirm = await A('POST', `/invoices/${billA.invoiceId}/proof`, { proofKey });
  check('confirming moves it into the queue', confirm.status === 200, JSON.stringify(confirm.body));
  const [queued] = await sql`SELECT status, proof_key FROM invoices WHERE id = ${billA.invoiceId}`;
  check(
    'status is AWAITING_VERIFICATION',
    queued.status === 'AWAITING_VERIFICATION',
    queued.status,
  );
  check('proof key stored', queued.proof_key === proofKey);

  console.log("\nA proof cannot be pointed at someone else's invoice");
  const stolen = await B('POST', `/invoices/${billB.invoiceId}/proof`, { proofKey });
  check('mismatched proof key is refused 422', stolen.status === 422, `got ${stolen.status}`);

  console.log('\nThe database refuses a forged status even without the API');
  /**
   * Assert the OUTCOME, not that an exception was raised.
   *
   * There are two ways this is refused and only one of them throws: the row
   * policy can match zero rows (a silent no-op) or the column trigger can raise.
   * An earlier version of this test only caught the throw, so it reported a
   * PASS-shaped failure when the policy quietly did the right thing. What
   * matters is that the status did not move.
   */
  await sql
    .begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('request.jwt.claims', '${JSON.stringify({ sub: parentA.id })}', true)`,
      );
      await tx.unsafe('SET LOCAL ROLE authenticated');
      await tx`UPDATE invoices SET status = 'PAID', paid_at = now() WHERE id = ${billA.invoiceId}`;
    })
    .catch(() => {});
  const [afterForge] =
    await sql`SELECT status, paid_at FROM invoices WHERE id = ${billA.invoiceId}`;
  check(
    'a guardian cannot set PAID in raw SQL',
    afterForge.status === 'AWAITING_VERIFICATION' && afterForge.paid_at === null,
    `${afterForge.status} paid_at=${afterForge.paid_at}`,
  );

  console.log('\nVerification (FR-PAY-3)');
  const proofView = await F('GET', `/invoices/${billA.invoiceId}/proof-view`);
  check(
    'Finance can open the proof',
    proofView.status === 200 && Boolean(proofView.body?.data?.url),
  );
  check('the link is short-lived', proofView.body?.data?.expiresInSeconds === 300);

  const verified = await F('POST', `/invoices/${billA.invoiceId}/verify`, {}, key());
  check('Finance verifies it', verified.status === 200, JSON.stringify(verified.body));
  check(
    'invoice becomes PAID',
    verified.body?.data?.status === 'PAID',
    verified.body?.data?.status,
  );
  check('account activated (FR-ENR-5)', verified.body?.data?.activated === true);

  const [paidInv] =
    await sql`SELECT status, paid_at, method FROM invoices WHERE id = ${billA.invoiceId}`;
  const [student] = await sql`SELECT account_status FROM students WHERE id = ${billA.studentId}`;
  const [payment] =
    await sql`SELECT gross_amount, verified_by_id, verified_at FROM payments WHERE invoice_id = ${billA.invoiceId}`;
  check('paid_at recorded', Boolean(paidInv.paid_at));
  check('student is ACTIVE', student.account_status === 'ACTIVE', student.account_status);
  check('payment row records the full amount', Number(payment.gross_amount) === 750000);
  check('payment attributed to the verifier', payment.verified_by_id === finance.id);

  const [audit] = await sql`
    SELECT action FROM audit_log WHERE entity = 'invoice' AND entity_id = ${billA.invoiceId}
    AND action = 'payment.verified' LIMIT 1`;
  check('an audit row was written (FR-PAY-3)', Boolean(audit));

  const [receipt] = await sql`
    SELECT topic FROM outbox_message WHERE payload->>'invoiceId' = ${billA.invoiceId}
    AND topic = 'notification.payment-verified'`;
  check('receipt email queued', Boolean(receipt));

  console.log('\nDouble approval must not double-count');
  const twice = await F('POST', `/invoices/${billA.invoiceId}/verify`, {}, key());
  check('second verify is refused 409', twice.status === 409, `got ${twice.status}`);
  const [{ n: payCount }] =
    await sql`SELECT count(*)::int n FROM payments WHERE invoice_id = ${billA.invoiceId}`;
  check('still exactly one payment row', payCount === 1, `n=${payCount}`);

  console.log('\nPartial payment (FR-PAY-5)');
  const partialBill = await makeBilledStudent(parentB.id, programId, 1000000);
  const part1 = await F(
    'POST',
    `/invoices/${partialBill.invoiceId}/verify`,
    { grossAmount: 400000 },
    key(),
  );
  check('a part payment is accepted', part1.status === 200, JSON.stringify(part1.body));
  check(
    'status becomes INSTALLMENT',
    part1.body?.data?.status === 'INSTALLMENT',
    part1.body?.data?.status,
  );
  const [partStudent] =
    await sql`SELECT account_status FROM students WHERE id = ${partialBill.studentId}`;
  check(
    'account NOT activated on a part payment',
    partStudent.account_status === 'LIMITED',
    partStudent.account_status,
  );

  const part2 = await F(
    'POST',
    `/invoices/${partialBill.invoiceId}/verify`,
    { grossAmount: 600000 },
    key(),
  );
  check('the balance settles it', part2.body?.data?.status === 'PAID', part2.body?.data?.status);
  check(
    'total settled is the full amount',
    part2.body?.data?.paidAmount === 1000000,
    String(part2.body?.data?.paidAmount),
  );
  const [nowActive] =
    await sql`SELECT account_status FROM students WHERE id = ${partialBill.studentId}`;
  check('now activated', nowActive.account_status === 'ACTIVE', nowActive.account_status);

  console.log('\nRejection (FR-PAY-3)');
  const rejectBill = await makeBilledStudent(parentA.id, programId);
  await sql`UPDATE invoices SET status = 'AWAITING_VERIFICATION', proof_key = 'x/y/z.jpg' WHERE id = ${rejectBill.invoiceId}`;

  const noReason = await F('POST', `/invoices/${rejectBill.invoiceId}/reject`, {});
  check(
    'rejecting without a reason is refused 422',
    noReason.status === 422,
    `got ${noReason.status}`,
  );

  const rejected = await F('POST', `/invoices/${rejectBill.invoiceId}/reject`, {
    reason: 'Nominal transfer tidak sesuai tagihan.',
  });
  check('rejection succeeds with a reason', rejected.status === 200, JSON.stringify(rejected.body));
  const [rej] =
    await sql`SELECT status, proof_key FROM invoices WHERE id = ${rejectBill.invoiceId}`;
  check('invoice returns to payable', rej.status === 'UNPAID', rej.status);
  check('the rejected proof is cleared so a new one must be sent', rej.proof_key === null);
  const [rejMail] = await sql`
    SELECT topic FROM outbox_message WHERE payload->>'invoiceId' = ${rejectBill.invoiceId}
    AND topic = 'notification.payment-rejected'`;
  check('rejection email queued with the reason', Boolean(rejMail));
} finally {
  const students = await sql`SELECT id, user_id FROM students WHERE slug LIKE ${`${TAG}%`}`;
  const sids = students.map((s) => s.id);
  if (sids.length) {
    const invs = await sql`SELECT id FROM invoices WHERE student_id = ANY(${sids})`;
    const iids = invs.map((i) => i.id);
    if (iids.length) {
      await sql`DELETE FROM notifications WHERE entity_type = 'invoice' AND entity_id = ANY(${iids.map(String)})`;
      await sql`DELETE FROM activity_event WHERE entity_type = 'invoice' AND entity_id = ANY(${iids.map(String)})`;
      await sql`DELETE FROM audit_log WHERE entity = 'invoice' AND entity_id = ANY(${iids.map(String)})`;
      await sql`DELETE FROM outbox_message WHERE payload->>'invoiceId' = ANY(${iids})`;
      await sql`DELETE FROM payments WHERE invoice_id = ANY(${iids})`;
      await sql`DELETE FROM invoices WHERE id = ANY(${iids})`;
    }
    await sql`DELETE FROM enrollments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  await sql`DELETE FROM programs WHERE slug = ${`${TAG}-prog`}`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM idempotency_key WHERE actor_id = ${id}`;
    await sql`DELETE FROM activity_event WHERE actor_id = ${id}`;
    await sql`UPDATE payments SET verified_by_id = NULL WHERE verified_by_id = ${id}`;
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
