import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Conversion transaction, integration tests (doc 14 §1.4 / FR-ENR-1..4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * This is the first workflow that creates money, so the assertions are about
 * the properties FR-ENR-1 actually names. One transaction, no partial state,
 * no double conversion, rather than about the happy path returning 201.
 *
 *   npm run dev             # in one terminal
 *   npm run test:conversion # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const TAG = 'conv-test';
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

/** A signed-in staff account with the given role. */
async function tokenFor(roleCode, tag) {
  const email = `${TAG}-${tag}-${Date.now()}@example.test`;
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
  const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
  await sql`INSERT INTO users (id, email, full_name, primary_role_id)
            VALUES (${created.user.id}, ${email}, ${`Conv ${tag}`}, ${roleId})`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;

  // Straight to GoTrue: this suite tests conversion, not the login rate limit.
  const anon = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const session = await retry(async () => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session;
  });
  return { id: created.user.id, token: session.access_token };
}

/**
 * Every convert call carries an Idempotency-Key, because the endpoint requires
 * one. That is deliberate on the API side: a double-clicked 'Jadikan Siswa'
 * button must replay the first response, not attempt a second conversion.
 */
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

/** Insert a lead directly, the funnel itself is covered by test-leads. */
async function makeLead(programId, overrides = {}) {
  const [row] = await sql`
    INSERT INTO registrations
      (child_name, parent_name, parent_phone, parent_email, school, level, type,
       program_id, status, source, campaign)
    VALUES (${overrides.childName ?? 'Anak Konversi'},
            ${overrides.parentName ?? 'Ibu Konversi'},
            ${`0812${Math.floor(1e8 + Math.random() * 8e8)}`},
            ${overrides.parentEmail === null ? null : (overrides.parentEmail ?? `${TAG}-parent-${crypto.randomUUID()}@example.test`)},
            'SMPN 1 Denpasar', 'SMP', 'CONSULTATION',
            ${overrides.programId === null ? null : programId},
            ${overrides.status ?? 'CONSULTING'}, 'test', ${TAG})
    RETURNING id, parent_email`;
  return row;
}

const staffIds = [];
let programId;

try {
  // ON CONFLICT so a crashed previous run cannot wedge the next one on a
  // leftover fixture, the failure would be about the fixture, not the code.
  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog`}, 'Konversi Test', 'ACADEMIC', ARRAY['SMP'], 750000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET price_monthly = 750000
    RETURNING id`;
  programId = program.id;

  const secretary = await tokenFor('SECRETARY', 'sec');
  staffIds.push(secretary.id);
  const mentor = await tokenFor('MENTOR', 'men');
  staffIds.push(mentor.id);

  const sec = api(secretary.token);
  const men = api(mentor.token);

  console.log('\nAuthorisation');
  const leadForMentor = await makeLead(programId);
  const denied = await men(
    'POST',
    `/registrations/${leadForMentor.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('a Mentor cannot convert (403)', denied.status === 403, `got ${denied.status}`);
  const [afterDenied] = await sql`
    SELECT converted_student_id FROM registrations WHERE id = ${leadForMentor.id}`;
  check('the refused attempt created nothing', afterDenied.converted_student_id === null);

  console.log('\nOne transaction (FR-ENR-1)');
  const lead = await makeLead(programId);
  const res = await sec(
    'POST',
    `/registrations/${lead.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('convert returns 201', res.status === 201, JSON.stringify(res.body));

  const d = res.body?.data ?? {};
  check('returns the new student', Boolean(d.studentId));
  check(
    'returns an invoice number',
    /^INV\/\d{4}\/\d{2}\/\d{6}$/.test(d.invoiceNumber ?? ''),
    d.invoiceNumber,
  );

  const [student] = await sql`SELECT * FROM students WHERE id = ${d.studentId}`;
  const [enrollment] = await sql`SELECT * FROM enrollments WHERE student_id = ${d.studentId}`;
  const [invoice] = await sql`SELECT * FROM invoices WHERE id = ${d.invoiceId}`;
  const [userRow] = await sql`SELECT * FROM users WHERE id = ${d.userId}`;
  const [reg] =
    await sql`SELECT status, converted_student_id FROM registrations WHERE id = ${lead.id}`;

  check('User created', Boolean(userRow));
  check('Student created', Boolean(student));
  check('Enrollment created', Boolean(enrollment));
  check('Invoice created', Boolean(invoice));

  console.log('\nBusiness rules');
  check(
    'student is LIMITED, not locked out (FR-ENR-4)',
    student?.account_status === 'LIMITED',
    student?.account_status,
  );
  check(
    'price snapshot frozen on the enrolment (FR-ENR-2)',
    enrollment?.price_monthly_snapshot === 750000,
    String(enrollment?.price_monthly_snapshot),
  );
  check('invoice is a REGISTRATION invoice', invoice?.type === 'REGISTRATION', invoice?.type);
  check('invoice is UNPAID', invoice?.status === 'UNPAID', invoice?.status);
  check(
    'invoice amount matches the programme price',
    Number(invoice?.amount) === 750000,
    String(invoice?.amount),
  );
  check('invoice links back to the lead', invoice?.registration_id === lead.id);

  const due = new Date(invoice?.due_date);
  const days = Math.round((due - new Date()) / 86400000);
  check('invoice is due in 7 days (FR-ENR-1)', days >= 6 && days <= 8, `${days} days`);

  check('lead marked CONVERTED', reg?.status === 'CONVERTED', reg?.status);
  check('lead points at the student', reg?.converted_student_id === d.studentId);

  const [roleRow] = await sql`
    SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${d.userId}`;
  check('guardian holds the customer role', roleRow?.code === 'PARENT', roleRow?.code);

  console.log('\nA price change must not rewrite an issued invoice (FR-ENR-2)');
  await sql`UPDATE programs SET price_monthly = 999000 WHERE id = ${programId}`;
  const [reread] =
    await sql`SELECT price_monthly_snapshot FROM enrollments WHERE student_id = ${d.studentId}`;
  const [rereadInv] = await sql`SELECT amount FROM invoices WHERE id = ${d.invoiceId}`;
  check('snapshot unchanged', reread?.price_monthly_snapshot === 750000);
  check('issued invoice unchanged', Number(rereadInv?.amount) === 750000);
  await sql`UPDATE programs SET price_monthly = 750000 WHERE id = ${programId}`;

  console.log('\nConverting twice must be impossible');
  const again = await sec(
    'POST',
    `/registrations/${lead.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('second convert is refused 409', again.status === 409, `got ${again.status}`);
  const [{ n: studentCount }] = await sql`
    SELECT count(*)::int n FROM students WHERE registration_id = ${lead.id}`;
  check('still exactly one student', studentCount === 1, `n=${studentCount}`);
  const [{ n: invCount }] = await sql`
    SELECT count(*)::int n FROM invoices WHERE registration_id = ${lead.id}`;
  check('still exactly one invoice', invCount === 1, `n=${invCount}`);

  console.log('\nThe email is queued, not sent inline');
  const [queued] = await sql`
    SELECT topic, status FROM outbox_message
    WHERE payload->>'studentId' = ${d.studentId}`;
  check(
    'enrolment notification queued',
    queued?.topic === 'notification.enrollment-created',
    JSON.stringify(queued),
  );

  console.log('\nRefusals leave no partial state');
  const noEmail = await makeLead(programId, { parentEmail: null });
  const r1 = await sec(
    'POST',
    `/registrations/${noEmail.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('no guardian email is refused 422', r1.status === 422, `got ${r1.status}`);
  check(
    'error names the missing field',
    r1.body?.error?.code === 'PARENT_EMAIL_REQUIRED',
    r1.body?.error?.code,
  );
  const [{ n: orphanA }] = await sql`
    SELECT count(*)::int n FROM students WHERE registration_id = ${noEmail.id}`;
  check('no student created', orphanA === 0);

  const noProgram = await makeLead(programId, { programId: null });
  const r2 = await sec(
    'POST',
    `/registrations/${noProgram.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('no programme is refused 422', r2.status === 422, `got ${r2.status}`);
  const [{ n: orphanB }] = await sql`
    SELECT count(*)::int n FROM invoices WHERE registration_id = ${noProgram.id}`;
  check('no invoice created', orphanB === 0);

  const lost = await makeLead(programId, { status: 'LOST' });
  const r3 = await sec(
    'POST',
    `/registrations/${lost.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('a LOST lead cannot be converted (422)', r3.status === 422, `got ${r3.status}`);

  const missing = await sec(
    'POST',
    `/registrations/${crypto.randomUUID()}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check('unknown lead is 404', missing.status === 404, `got ${missing.status}`);

  console.log('\nSiblings share one guardian login');
  const sharedEmail = `${TAG}-shared-${Date.now()}@example.test`;
  const kid1 = await makeLead(programId, { parentEmail: sharedEmail, childName: 'Kakak' });
  const kid2 = await makeLead(programId, { parentEmail: sharedEmail, childName: 'Adik' });
  const c1 = await sec(
    'POST',
    `/registrations/${kid1.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  const c2 = await sec(
    'POST',
    `/registrations/${kid2.id}/convert`,
    {},
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  check(
    'both siblings convert',
    c1.status === 201 && c2.status === 201,
    `${c1.status}/${c2.status}`,
  );
  check('onto the SAME guardian account', c1.body?.data?.userId === c2.body?.data?.userId);
  check('as two distinct students', c1.body?.data?.studentId !== c2.body?.data?.studentId);
} finally {
  // Students/enrolments/invoices cascade from the guardian user; remove the
  // leads first so nothing references them.
  const leadIds = await sql`SELECT id FROM registrations WHERE campaign = ${TAG}`;
  const ids = leadIds.map((r) => r.id);
  if (ids.length) {
    await sql`DELETE FROM outbox_message WHERE payload->>'registrationId' = ANY(${ids})`;
    await sql`DELETE FROM notifications WHERE entity_type = 'invoice' AND entity_id IN
              (SELECT id::text FROM invoices WHERE registration_id = ANY(${ids}))`;
    await sql`DELETE FROM invoices WHERE registration_id = ANY(${ids})`;
    await sql`DELETE FROM enrollments WHERE student_id IN
              (SELECT id FROM students WHERE registration_id = ANY(${ids}))`;
    const guardians =
      await sql`SELECT DISTINCT user_id FROM students WHERE registration_id = ANY(${ids})`;
    await sql`DELETE FROM students WHERE registration_id = ANY(${ids})`;
    await sql`DELETE FROM registration_contacts WHERE registration_id = ANY(${ids})`;
    await sql`DELETE FROM registrations WHERE campaign = ${TAG}`;

    for (const g of guardians) {
      await sql`DELETE FROM user_roles WHERE user_id = ${g.user_id}`;
      await sql`DELETE FROM audit_log WHERE actor_id = ${g.user_id}`;
      await sql`DELETE FROM idempotency_key WHERE actor_id = ${g.user_id}`;
      await sql`DELETE FROM activity_event WHERE actor_id = ${g.user_id}`;
      await sql`DELETE FROM users WHERE id = ${g.user_id}`;
      await retry(async () => {
        const { error } = await supabase.auth.admin.deleteUser(g.user_id);
        if (error && !/not found/i.test(error.message)) throw new Error(error.message);
      }).catch(() => {});
    }
  }
  await sql`DELETE FROM programs WHERE slug = ${`${TAG}-prog`}`;
  for (const id of staffIds) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM idempotency_key WHERE actor_id = ${id}`;
    await sql`DELETE FROM activity_event WHERE actor_id = ${id}`;
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
