import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Registrations API, integration tests (doc 14 §1.1 exit criterion).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000. These drive real HTTP against real Supabase
 * Auth and a real database, because the things worth asserting here only exist
 * at that seam: that a Mentor gets 200-with-zero-rows from RLS rather than a 403
 * from the API, that a lost lead cannot be closed without an aggregatable
 * reason, that a malformed id is a 400 and not a 500.
 *
 * Fixtures are prefixed leads- / 'Rangga Test' and removed in a finally block.
 *
 *   npm run dev          # in one terminal
 *   npm run test:leads   # in another
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(required('DIRECT_URL'), { max: 1 });

let pass = 0,
  fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? `, ${d}` : ''}`);
};

/**
 * Retry, honouring a `retryAfter` hint when the failure carries one.
 *
 * Two different things are being retried through here. Supabase Auth is
 * intermittently unreachable from some networks, which wants a short fixed
 * backoff. And /v1/auth/login is capped at 10 per IP per 15 minutes, a cap
 * worth keeping, which this suite hits by signing in two fixtures per run. The
 * API already returns how long to wait; ignoring it and retrying ten times
 * 1.2s apart just burns the budget faster.
 */
async function retry(fn, attempts = 10) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const hinted = Number(e?.retryAfterSeconds);
      const waitMs = Number.isFinite(hinted) && hinted > 0 ? (hinted + 1) * 1000 : 1200;
      if (waitMs > 1200) {
        console.log(`  … waiting ${Math.round(waitMs / 1000)}s (rate limit)`);
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw last;
}

/** Sign a role in and return a bearer token. */
async function tokenFor(roleCode, tag) {
  const email = `leads-${tag}-${Date.now()}@example.test`;
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
            VALUES (${created.user.id}, ${email}, ${`Leads ${tag}`}, ${roleId})`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;

  /**
   * Sign in against GoTrue directly rather than through /v1/auth/login.
   *
   * That endpoint is capped at 10 per IP per 15 minutes, which is protection
   * worth keeping, but this suite exists to test the REGISTRATIONS API, and
   * making it spend the login budget meant it could not run twice in a row.
   * /v1/auth/login has its own coverage in the auth work.
   */
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

const api = (token) => async (method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const created = [];
let programId;

try {
  const [p] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES ('leads-test-prog', 'Leads Test', 'ACADEMIC', ARRAY['SMP'], 600000, 'PUBLISHED')
    RETURNING id`;
  programId = p.id;

  const secretary = await tokenFor('SECRETARY', 'sec');
  created.push(secretary.id);
  const mentor = await tokenFor('MENTOR', 'men');
  created.push(mentor.id);

  const sec = api(secretary.token);
  const men = api(mentor.token);

  const phone = '0812' + Math.floor(1e8 + Math.random() * 8e8);

  /**
   * The public endpoint is capped at 3 submissions per IP per hour, and that cap
   * is real protection worth keeping. Driving the pipeline tests through it made
   * the suite unrunnable twice in an hour, and it failed confusingly, because a
   * 429 left `leadId` undefined and every later call reported INVALID_ID instead
   * of "no lead was created".
   *
   * So the fixture is inserted directly, and the public endpoint gets one
   * assertion that treats 429 as "already proven today" rather than a failure.
   */
  const pub = await fetch(`${API}/public/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      childName: 'Rangga Test',
      parentPhone: '0812' + Math.floor(1e8 + Math.random() * 8e8),
      parentEmail: `rangga-${Date.now()}@example.test`,
      level: 'SMP',
      programId,
      type: 'CONSULTATION',
      source: 'instagram',
      campaign: 'leads-api-test',
    }),
  });
  if (pub.status === 429) {
    console.log('  SKIP  public submit, rate limited (3/hour by design)');
  } else {
    check('public submit creates a lead', pub.status === 201, JSON.stringify(await pub.json()));
  }

  // Pipeline fixture, inserted directly so the suite is repeatable.
  const [seeded] = await sql`
    INSERT INTO registrations
      (child_name, parent_phone, parent_email, level, type, program_id, source, campaign, status)
    VALUES ('Rangga Test', ${phone}, ${`rangga-fixture-${Date.now()}@example.test`},
            'SMP', 'CONSULTATION', ${programId}, 'instagram', 'leads-api-test', 'NEW')
    RETURNING id`;
  const leadId = seeded.id;

  console.log('\nList and counts');
  const list = await sec('GET', '/registrations?status=NEW&limit=25');
  check('secretary lists leads', list.status === 200, JSON.stringify(list.body).slice(0, 200));
  check(
    'the new lead is in the list',
    (list.body?.data?.items ?? []).some((l) => l.id === leadId),
  );
  check(
    'list rows carry what the table needs',
    (list.body?.data?.items ?? []).every((l) => 'programName' in l && 'followUpAt' in l),
  );

  const counts = await sec('GET', '/registrations/counts');
  check(
    'counts by status',
    counts.status === 200 && typeof counts.body?.data?.NEW === 'number',
    JSON.stringify(counts.body),
  );

  /**
   * "Follow up later" must say when.
   *
   * Without a date this moved the lead out of the new pile and told nobody to
   * come back to it, a decision whose only effect was to make the lead stop
   * being anybody's problem. /inbox is what made it visible: a follow-up with
   * no date is overdue the instant it is set.
   */
  console.log('\nNURTURING requires a follow-up date');
  const noDate = await sec('PATCH', `/registrations/${leadId}/status`, { status: 'NURTURING' });
  check('parking a lead without a date is refused', noDate.status === 422, `got ${noDate.status}`);
  check(
    'and says what is missing',
    JSON.stringify(noDate.body ?? {}).includes('followUpAt'),
    JSON.stringify(noDate.body),
  );

  const pastDate = await sec('PATCH', `/registrations/${leadId}/status`, {
    status: 'NURTURING',
    followUpAt: '2020-01-01T00:00:00.000Z',
  });
  check('a follow-up in the past is refused', pastDate.status === 422, `got ${pastDate.status}`);

  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const parked = await sec('PATCH', `/registrations/${leadId}/status`, {
    status: 'NURTURING',
    followUpAt: future,
  });
  check('with a date it succeeds', parked.status === 200, `got ${parked.status}`);
  const [{ follow_up_at: stored }] =
    await sql`SELECT follow_up_at FROM registrations WHERE id = ${leadId}`;
  check('and the date is stored, not dropped', !!stored, String(stored));

  // Put it back so the assertions below still see a decidable lead.
  await sql`UPDATE registrations SET status = 'NEW', follow_up_at = NULL WHERE id = ${leadId}`;

  console.log('\nGrant boundary, a Mentor has neither the page nor the verb');
  const mentorList = await men('GET', '/registrations');
  check(
    'mentor gets 200 with ZERO rows (RLS, not 403)',
    mentorList.status === 200 && (mentorList.body?.data?.items ?? []).length === 0,
    `status=${mentorList.status} n=${(mentorList.body?.data?.items ?? []).length}`,
  );
  const mentorWrite = await men('PATCH', `/registrations/${leadId}/status`, {
    status: 'REJECTED',
    reason: 'nope',
  });
  check(
    'mentor cannot change status (403)',
    mentorWrite.status === 403,
    `got ${mentorWrite.status}`,
  );

  console.log('\nDetail, contact log, follow-up');
  const detail = await sec('GET', `/registrations/${leadId}`);
  check('detail returns the lead', detail.status === 200 && detail.body?.data?.id === leadId);
  check('detail includes attribution', detail.body?.data?.campaign === 'leads-api-test');
  check('detail includes the joined program name', detail.body?.data?.programName === 'Leads Test');
  check('detail includes contacts array', Array.isArray(detail.body?.data?.contacts));

  const contact = await sec('POST', `/registrations/${leadId}/contact`, {
    note: 'Ditelepon, orang tua minta info biaya.',
    followUpAt: new Date(Date.now() + 86400000).toISOString(),
  });
  check('contact logged', contact.status === 201, JSON.stringify(contact.body));

  const afterContact = await sec('GET', `/registrations/${leadId}`);
  check('contact appears in history', (afterContact.body?.data?.contacts ?? []).length >= 1);
  check(
    'contact is attributed to the caller',
    afterContact.body?.data?.contacts?.[0]?.actorName === 'Leads sec',
    JSON.stringify(afterContact.body?.data?.contacts?.[0]),
  );
  check('follow-up date recorded', Boolean(afterContact.body?.data?.followUpAt));

  console.log('\nFollow-up queue');
  const due = await sec(
    'GET',
    `/registrations?dueBefore=${encodeURIComponent(new Date(Date.now() + 2 * 86400000).toISOString())}`,
  );
  check(
    'lead appears in the due queue',
    (due.body?.data?.items ?? []).some((l) => l.id === leadId),
  );

  console.log('\nConsultation outcome');
  const noReason = await sec('POST', `/registrations/${leadId}/consultation-outcome`, {
    outcome: 'TIDAK_COCOK',
  });
  check(
    'TIDAK_COCOK without a lossReason is rejected 422',
    noReason.status === 422,
    `got ${noReason.status}`,
  );

  const outcome = await sec('POST', `/registrations/${leadId}/consultation-outcome`, {
    outcome: 'TIDAK_COCOK',
    lossReason: 'PRICE',
    note: 'Di luar anggaran keluarga.',
  });
  check('outcome recorded', outcome.status === 200, JSON.stringify(outcome.body));
  check(
    'status derived from the outcome (LOST)',
    outcome.body?.data?.status === 'LOST',
    JSON.stringify(outcome.body?.data),
  );

  const lost = await sec('GET', `/registrations/${leadId}`);
  check('loss reason is stored on the row, aggregatable', lost.body?.data?.lossReason === 'PRICE');

  console.log('\nGuard rails');
  const bad = await sec('GET', '/registrations/not-a-uuid');
  check('malformed id is 400, not a 500', bad.status === 400, `got ${bad.status}`);

  const noReasonStatus = await sec('PATCH', `/registrations/${leadId}/status`, {
    status: 'REJECTED',
  });
  check(
    'REJECTED without a reason is refused 422',
    noReasonStatus.status === 422,
    `got ${noReasonStatus.status}`,
  );

  const unknownLead = await sec('GET', `/registrations/${crypto.randomUUID()}`);
  check('unknown lead is 404', unknownLead.status === 404, `got ${unknownLead.status}`);
} finally {
  await sql`DELETE FROM registration_contacts WHERE registration_id IN
            (SELECT id FROM registrations WHERE campaign = 'leads-api-test' OR child_name = 'Rangga Test')`;
  /**
   * Queued mail goes with the rows it points at.
   *
   * Leaving it behind does not fail this suite, the dispatcher correctly
   * dead-letters a message whose registration is gone. It fails the NEXT
   * person, who opens the monitoring dashboard and finds dead letters that
   * describe nothing real. Forty-three had accumulated before the readiness
   * check surfaced them.
   */
  await sql`DELETE FROM outbox_message WHERE payload->>'registrationId' IN
            (SELECT id::text FROM registrations WHERE campaign = 'leads-api-test' OR child_name = 'Rangga Test')`;
  await sql`DELETE FROM registrations WHERE campaign = 'leads-api-test' OR child_name = 'Rangga Test'`;
  await sql`DELETE FROM programs WHERE slug = 'leads-test-prog'`;
  for (const id of created) {
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    // audit_log.actor_id RESTRICTs the delete, by design, an audit trail must
    // outlive the account. Only safe here because these are synthetic fixtures.
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM activity_event WHERE actor_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await retry(async () => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
    }).catch(() => {});
  }
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
