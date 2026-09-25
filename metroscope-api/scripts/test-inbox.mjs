import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The unified inbox, integration tests (doc 14 §1.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * What matters here is not that the queue returns rows. It is WHO sees WHICH
 * rows. The inbox is the one endpoint that reads several tables at once, so it
 * is the one place where a policy that is correct in isolation can still leak:
 * a guardian's own invoices are legitimately visible to them, and a naive
 * aggregate would hand them back as staff work items.
 *
 * The other half is the inverse failure, which is quieter and worse: work that
 * exists but never appears for the person meant to do it.
 *
 *   npm run dev        # in one terminal
 *   npm run test:inbox # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const anon = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const TAG = 'inbox-test';
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Inbox ${tag}`})`;
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

const api = (token) => async (method, path) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const idsOf = (res) => (res.body?.data?.items ?? []).map((i) => i.id);
const typesOf = (res) => new Set((res.body?.data?.items ?? []).map((i) => i.type));

const accounts = [];
let programId;

try {
  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog`}, 'Inbox Test', 'ACADEMIC', ARRAY['SMP'], 700000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET price_monthly = 700000
    RETURNING id`;
  programId = program.id;

  const guardian = await account('parent', 'PARENT');
  const finance = await account('fin', 'FINANCE');
  const secretary = await account('sec', 'SECRETARY');
  const mentor = await account('men', 'MENTOR');
  accounts.push(guardian.id, finance.id, secretary.id, mentor.id);

  const P = api(guardian.token);
  const F = api(finance.token);
  const S = api(secretary.token);
  const M = api(mentor.token);

  // ── Fixtures: one of every item type ───────────────────────────────
  const [student] = await sql`
    INSERT INTO students (user_id, name, slug, join_date, account_status, student_status)
    VALUES (${guardian.id}, ${`${TAG} Anak`}, ${`${TAG}-${crypto.randomUUID().slice(0, 8)}`},
            CURRENT_DATE, 'ACTIVE', 'ACTIVE')
    RETURNING id`;
  await sql`INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
            VALUES (${student.id}, ${programId}, CURRENT_DATE, 700000)`;

  const [newLead] = await sql`
    INSERT INTO registrations (type, status, child_name, level, parent_phone, source)
    VALUES ('DIRECT', 'NEW', ${`${TAG} Baru`}, 'SMP', '0800000001', ${TAG})
    RETURNING id`;
  const [consultingLead] = await sql`
    INSERT INTO registrations (type, status, child_name, level, parent_phone, source)
    VALUES ('CONSULTATION', 'CONSULTING', ${`${TAG} Konsul`}, 'SMP', '0800000002', ${TAG})
    RETURNING id`;
  const [dueLead] = await sql`
    INSERT INTO registrations (type, status, child_name, level, parent_phone, source, follow_up_at)
    VALUES ('DIRECT', 'NURTURING', ${`${TAG} Jatuh Tempo`}, 'SMP', '0800000003', ${TAG}, now() - interval '1 day')
    RETURNING id`;
  const [futureLead] = await sql`
    INSERT INTO registrations (type, status, child_name, level, parent_phone, source, follow_up_at)
    VALUES ('DIRECT', 'NURTURING', ${`${TAG} Nanti`}, 'SMP', '0800000004', ${TAG}, now() + interval '30 days')
    RETURNING id`;
  const [convertedLead] = await sql`
    INSERT INTO registrations (type, status, child_name, level, parent_phone, source)
    VALUES ('DIRECT', 'CONVERTED', ${`${TAG} Selesai`}, 'SMP', '0800000005', ${TAG})
    RETURNING id`;

  const [proof] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date,
                          proof_key, proof_uploaded_at)
    VALUES (app.next_invoice_number(), ${student.id}, 700000, ${`${TAG}-p`}, 'MONTHLY',
            'AWAITING_VERIFICATION', CURRENT_DATE, 'proofs/fake.jpg', now() - interval '2 hours')
    RETURNING id, number`;

  const [overdue] = await sql`
    INSERT INTO invoices (number, student_id, amount, late_fee, period, type, status, due_date)
    VALUES (app.next_invoice_number(), ${student.id}, 700000, 15000, ${`${TAG}-p`}, 'MONTHLY',
            'OVERDUE', CURRENT_DATE - 10)
    RETURNING id, number`;

  const [paid] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date, paid_at)
    VALUES (app.next_invoice_number(), ${student.id}, 700000, ${`${TAG}-p`}, 'MONTHLY',
            'PAID', CURRENT_DATE - 20, now())
    RETURNING id`;

  const [draftRun] = await sql`
    INSERT INTO billing_runs (period, status, invoice_count, total_amount)
    VALUES (${'2099-06'}, 'DRAFT', 4, 2800000)
    RETURNING id`;

  // ── Access ─────────────────────────────────────────────────────────
  console.log('\nWho may open the queue at all');

  const noAuth = await api(null)('GET', '/inbox');
  check('unauthenticated is 401', noAuth.status === 401, `got ${noAuth.status}`);

  const parentTry = await P('GET', '/inbox');
  check(
    'a guardian is refused, /inbox is not their page',
    parentTry.status === 403,
    `got ${parentTry.status}`,
  );

  /**
   * The reason this endpoint carries a page gate at all. The guardian owns
   * `student`, so `invoices_select` legitimately returns their AWAITING_VERIFICATION
   * and OVERDUE rows. Without the gate the staff queue would hand a parent their
   * own unpaid bills as decisions to make.
   */
  check(
    'and so cannot receive their own invoices as work items',
    !JSON.stringify(parentTry.body ?? {}).includes(proof.number),
  );

  const parentCounts = await P('GET', '/inbox/counts');
  check('counts are refused too', parentCounts.status === 403, `got ${parentCounts.status}`);

  console.log('\nStaff see the queue');
  const finList = await F('GET', '/inbox?limit=100');
  check('Finance can open it', finList.status === 200, `got ${finList.status}`);
  const secList = await S('GET', '/inbox?limit=100');
  check('Secretary can open it', secList.status === 200, `got ${secList.status}`);
  const menList = await M('GET', '/inbox?limit=100');
  check('Mentor can open it', menList.status === 200, `got ${menList.status}`);

  // ── Grants decide the contents ─────────────────────────────────────
  console.log('\nGrants decide what is in it');

  const secIds = idsOf(secList);
  const finIds = idsOf(finList);

  check(
    'Secretary sees the new lead',
    secIds.includes(`registration:${newLead.id}`),
    secIds.join(','),
  );
  check(
    'Secretary does NOT see payment proofs, no finance page',
    !secIds.includes(`payment_proof:${proof.id}`),
  );
  check('Secretary does NOT see overdue invoices', !secIds.includes(`overdue:${overdue.id}`));
  check('Secretary does NOT see the drafted run', !secIds.includes(`billing_run:${draftRun.id}`));

  check('Finance sees the payment proof', finIds.includes(`payment_proof:${proof.id}`));
  check('Finance sees the overdue invoice', finIds.includes(`overdue:${overdue.id}`));
  check('Finance sees the drafted billing run', finIds.includes(`billing_run:${draftRun.id}`));
  check(
    'Finance does NOT see leads, no /leads grant',
    !finIds.includes(`registration:${newLead.id}`),
  );

  /**
   * A Mentor holds /inbox and none of the four sources' pages. An empty queue is
   * the correct answer, not an error, their item types (un-assessed students,
   * content) arrive with their tables in Phases 2–3.
   */
  check('Mentor holds the page but no sources yet, empty queue', idsOf(menList).length === 0);

  // ── Which rows are actually "waiting" ──────────────────────────────
  console.log('\nOnly work that is genuinely pending');

  check('a NEW lead is pending', secIds.includes(`registration:${newLead.id}`));
  check(
    'a CONSULTING lead is pending, the outcome is unrecorded',
    secIds.includes(`registration:${consultingLead.id}`),
  );
  check(
    'a NURTURING lead whose follow-up has come due is pending',
    secIds.includes(`registration:${dueLead.id}`),
  );
  check(
    'a NURTURING lead scheduled for next month is NOT. It waits on the calendar',
    !secIds.includes(`registration:${futureLead.id}`),
  );
  check(
    'a CONVERTED lead is not pending anything',
    !secIds.includes(`registration:${convertedLead.id}`),
  );
  check('a PAID invoice is not in the queue', !finIds.includes(`overdue:${paid.id}`));

  // ── Item shape ─────────────────────────────────────────────────────
  console.log('\nEach item carries what the row needs to render');

  const proofItem = (finList.body.data.items ?? []).find(
    (i) => i.id === `payment_proof:${proof.id}`,
  );
  check('proof item has a title', proofItem?.title === `${TAG} Anak`, proofItem?.title);
  check(
    'proof item links to the verification queue',
    proofItem?.href === '/finance/verifications',
    proofItem?.href,
  );
  check('proof item carries the amount', proofItem?.amount === 700000, String(proofItem?.amount));
  check('proof item waits from the upload, not the due date', !!proofItem?.waitingSince);

  const overdueItem = (finList.body.data.items ?? []).find((i) => i.id === `overdue:${overdue.id}`);
  /**
   * Total payable is amount + late_fee, and the fee is READ, never recomputed.
   * A queue that showed the bare amount would have Finance chasing a number the
   * parent was never asked for.
   */
  check(
    'overdue item shows amount + stored late fee',
    overdueItem?.amount === 715000,
    String(overdueItem?.amount),
  );

  const runItem = (finList.body.data.items ?? []).find(
    (i) => i.id === `billing_run:${draftRun.id}`,
  );
  check('run item links to the review screen', runItem?.href === '/finance/invoices?view=run');
  check('run item carries the run total', runItem?.amount === 2800000, String(runItem?.amount));

  // ── Ordering ───────────────────────────────────────────────────────
  console.log('\nOldest first');
  const waits = (finList.body.data.items ?? []).map((i) => new Date(i.waitingSince).getTime());
  /**
   * The length check is not decoration. `every()` on a one-item array is
   * vacuously true, so an ordering assertion can quietly stop testing anything
   * the moment a fixture changes.
   */
  check(
    'items are sorted by how long they have waited',
    waits.length >= 3 && waits.every((w, i) => i === 0 || waits[i - 1] <= w),
    waits.join(','),
  );

  // ── Filtering ──────────────────────────────────────────────────────
  console.log('\nFiltering by type');
  const onlyOverdue = await F('GET', '/inbox?type=overdue');
  check(
    '?type=overdue returns only overdue',
    [...typesOf(onlyOverdue)].every((t) => t === 'overdue'),
  );
  check(
    'and still contains the overdue invoice',
    idsOf(onlyOverdue).includes(`overdue:${overdue.id}`),
  );

  const notBuilt = await F('GET', '/inbox?type=content');
  check(
    'a declared-but-unbuilt type returns empty, not 500',
    notBuilt.status === 200 && idsOf(notBuilt).length === 0,
    `got ${notBuilt.status}`,
  );

  const badType = await F('GET', '/inbox?type=nonsense');
  check('an unknown type is 422, not ignored', badType.status === 422, `got ${badType.status}`);

  const badLimit = await F('GET', '/inbox?limit=5000');
  check('limit above the cap is refused', badLimit.status === 422, `got ${badLimit.status}`);

  // ── Counts ─────────────────────────────────────────────────────────
  console.log('\nCounts');
  const fCounts = await F('GET', '/inbox/counts');
  check('counts respond', fCounts.status === 200, `got ${fCounts.status}`);
  check(
    'Finance counts include the proof',
    fCounts.body?.data?.byType?.payment_proof >= 1,
    JSON.stringify(fCounts.body?.data?.byType),
  );
  check('Finance counts exclude leads', fCounts.body?.data?.byType?.registration === 0);

  const sCounts = await S('GET', '/inbox/counts');
  check('Secretary counts include leads', sCounts.body?.data?.byType?.registration >= 3);
  check('Secretary counts exclude money', sCounts.body?.data?.byType?.payment_proof === 0);

  check(
    'total equals the sum of the per-type counts',
    fCounts.body.data.total === Object.values(fCounts.body.data.byType).reduce((a, b) => a + b, 0),
  );

  /**
   * The badge must be able to say more than the page shows. A count derived
   * from the capped list would under-report the backlog, the one thing a work
   * queue must never do.
   */
  const capped = await F('GET', '/inbox?limit=1');
  check('the list caps at the requested limit', idsOf(capped).length === 1);
  check(
    'while counts stay uncapped',
    fCounts.body.data.total > idsOf(capped).length,
    `${fCounts.body.data.total} vs 1`,
  );

  check(
    'every declared type has a count key, even unbuilt ones',
    [
      'registration',
      'payment_proof',
      'overdue',
      'billing_run',
      'content',
      'reschedule',
      'unassessed',
    ].every((t) => typeof fCounts.body.data.byType[t] === 'number'),
  );
} finally {
  console.log('\nCleaning up…');
  const students = await sql`SELECT id FROM students WHERE slug LIKE ${`${TAG}%`}`;
  const sids = students.map((s) => s.id);
  if (sids.length) {
    await sql`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id = ANY(${sids}))`;
    await sql`DELETE FROM invoices WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM enrollments WHERE student_id = ANY(${sids})`;
    await sql`DELETE FROM students WHERE id = ANY(${sids})`;
  }
  await sql`DELETE FROM registrations WHERE source = ${TAG}`;
  await sql`DELETE FROM billing_runs WHERE period = ${'2099-06'}`;
  await sql`DELETE FROM programs WHERE slug = ${`${TAG}-prog`}`;
  for (const id of accounts) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM idempotency_key WHERE actor_id = ${id}`;
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
