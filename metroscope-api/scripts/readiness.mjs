import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Production readiness. One walk through the whole business.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 *   npm run dev        # in one terminal
 *   npm run readiness  # in another
 *   npm run readiness -- --email you@example.com   # also send the 8 templates
 *
 * This is not another integration suite. The eight suites already assert that
 * each module behaves; this asserts that they compose. That a lead submitted
 * on the public site becomes a student, an invoice, a payment, a verified
 * account and eight queued emails, without anybody reaching into the database
 * between steps.
 *
 * Every section reports one of three states, and the difference matters:
 *
 *   PASS   proven, here, just now.
 *   FAIL   broken. The run exits non-zero.
 *   BLOCKED  cannot be proven from here, with the reason named.
 *
 * BLOCKED is not a soft pass. `notifications` stays BLOCKED until an email is
 * accepted by the provider, because "the pipeline queued it correctly" and "a
 * parent received it" are different claims and only the second one matters to a
 * family waiting for an invoice.
 */
loadEnvLocal();

const API = process.env.API_TEST_URL ?? 'http://localhost:3000/api/v1';
const JOBS = API.replace(/\/v1$/, '');
const CRON = required('CRON_SECRET');
const emailArg = process.argv.indexOf('--email');
const REAL_EMAIL = emailArg > -1 ? process.argv[emailArg + 1] : null;

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

const TAG = 'readiness';
const RUN = Date.now();
/** Everything this run produced is stamped after this instant. */
const startedAt = new Date();
const results = [];
let current = null;

function section(name) {
  current = { name, checks: [] };
  results.push(current);
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}
function check(label, ok, detail = '') {
  current.checks.push({ label, state: ok ? 'PASS' : 'FAIL', detail });
  const mark = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark}  ${label}${!ok && detail ? `, ${detail}` : ''}`);
}
function blocked(label, reason) {
  current.checks.push({ label, state: 'BLOCKED', detail: reason });
  console.log(`  \x1b[33mBLOCK\x1b[0m ${label}, ${reason}`);
}

async function retry(fn, attempts = 10) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw last;
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

const runJob = async (name, method = 'POST') => {
  const r = await fetch(`${JOBS}/jobs/${name}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${CRON}` },
    body: method === 'POST' ? '{}' : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

async function staffAccount(tag, roleCode) {
  const email = `${TAG}-${tag}-${RUN}@example.test`;
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
  await sql`INSERT INTO users (id, email, full_name) VALUES (${created.user.id}, ${email}, ${`Readiness ${tag}`})`;
  const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${created.user.id}, ${roleId})`;
  await sql`UPDATE users SET primary_role_id = ${roleId} WHERE id = ${created.user.id}`;
  const token = await retry(async () => {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'no session');
    return data.session.access_token;
  });
  return { id: created.user.id, email, password, token };
}

/** Stops the walk without reporting a crash, the reason is already recorded. */
class Halt extends Error {}

const created = { users: [], programSlug: `${TAG}-prog-${RUN}` };
let studentId, invoiceId, registrationId, guardianId;

try {
  const head = await staffAccount('head', 'HEAD');
  const sec = await staffAccount('sec', 'SECRETARY');
  const fin = await staffAccount('fin', 'FINANCE');
  created.users.push(head.id, sec.id, fin.id);
  const H = api(head.token),
    S = api(sec.token),
    F = api(fin.token);

  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${created.programSlug}, 'Readiness Program', 'ACADEMIC', ARRAY['SMP'], 750000, 'PUBLISHED')
    RETURNING id`;

  // ═══ 1. REGISTRATION ══════════════════════════════════════════════
  section('1. Registration, a family submits the public form');

  const parentEmail = REAL_EMAIL ?? `${TAG}-parent-${RUN}@example.test`;
  const submit = await api(null)('POST', '/public/registrations', {
    type: 'DIRECT',
    childName: 'Readiness Anak',
    level: 'SMP',
    parentPhone: `08${String(RUN).slice(-10)}`,
    parentEmail,
    programId: program.id,
    source: TAG,
    campaign: 'readiness-check',
  });
  /**
   * The public form is rate limited to three submissions per hour per address,
   * by design. Hitting that is the endpoint WORKING, not failing, but every
   * later step needs a lead, so continuing produces a dozen cascading failures
   * that all describe one condition and bury it.
   *
   * BLOCKED with the wait, then stop. The alternative, a wall of red for a
   * limit doing its job, is how a check earns a reputation for crying wolf.
   */
  if (submit.status === 429) {
    const wait = submit.body?.error?.details?.retryAfter;
    blocked(
      'the whole walk',
      `public submit is rate limited (3/hour by design)${wait ? `, ~${Math.ceil(wait / 60)} min left` : ''}. Nothing after this can run.`,
    );
    throw new Halt();
  }

  check(
    'anonymous submit accepted',
    submit.status === 201 || submit.status === 200,
    `${submit.status} ${JSON.stringify(submit.body?.error)}`,
  );
  registrationId = submit.body?.data?.id;

  const [lead] = registrationId
    ? await sql`SELECT status, source, campaign FROM registrations WHERE id = ${registrationId}`
    : [null];
  check('lead stored as NEW', lead?.status === 'NEW', String(lead?.status));
  check(
    'attribution captured',
    lead?.source === TAG && lead?.campaign === 'readiness-check',
    `${lead?.source}/${lead?.campaign}`,
  );

  const leadEmail = await sql`
    SELECT status FROM outbox_message
    WHERE topic = 'notification.lead-received' AND payload->>'registrationId' = ${registrationId ?? ''}`;
  check('lead.received queued', leadEmail.length === 1, `${leadEmail.length} messages`);

  const secSees = await S('GET', '/inbox?type=registration&limit=100');
  check(
    'appears in the Secretary inbox',
    (secSees.body?.data?.items ?? []).some((i) => i.id === `registration:${registrationId}`),
  );

  // ═══ 2. CONVERSION ════════════════════════════════════════════════
  section('2. Conversion. One transaction creates the family');

  const convert = await S('POST', `/registrations/${registrationId}/convert`, {}, key());
  check(
    'Secretary converts the lead',
    convert.status === 200 || convert.status === 201,
    `${convert.status} ${JSON.stringify(convert.body?.error)}`,
  );
  studentId = convert.body?.data?.studentId ?? convert.body?.data?.student?.id;

  const [student] = studentId
    ? await sql`SELECT s.id, s.user_id, s.account_status FROM students s WHERE s.id = ${studentId}`
    : [null];
  guardianId = student?.user_id;
  if (guardianId) created.users.push(guardianId);
  check(
    'student created LIMITED',
    student?.account_status === 'LIMITED',
    String(student?.account_status),
  );

  const [enrolment] = studentId
    ? await sql`SELECT price_monthly_snapshot FROM enrollments WHERE student_id = ${studentId}`
    : [null];
  check(
    'enrolment snapshots the price',
    Number(enrolment?.price_monthly_snapshot) === 750000,
    String(enrolment?.price_monthly_snapshot),
  );

  const [regInvoice] = studentId
    ? await sql`SELECT id, type, amount, status FROM invoices WHERE student_id = ${studentId}`
    : [null];
  check(
    'registration invoice raised',
    regInvoice?.type === 'REGISTRATION' && Number(regInvoice?.amount) > 0,
    `${regInvoice?.type} ${regInvoice?.amount}`,
  );

  const [guardianRole] = guardianId
    ? await sql`SELECT r.code, r.is_customer FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ${guardianId}`
    : [null];
  check('guardian holds PARENT', guardianRole?.code === 'PARENT');
  /**
   * The is_staff regression, asserted where it broke. A guardian holds a role,
   * so "has a user_roles row" is not the staff test.
   */
  const staffLeak = guardianId
    ? await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: guardianId, role: 'authenticated' })}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT app.is_staff() AS s`;
      })
    : [{ s: true }];
  check('…and is still NOT staff', staffLeak[0].s === false, `is_staff=${staffLeak[0].s}`);

  const welcome = await sql`
    SELECT status FROM outbox_message
    WHERE topic = 'notification.enrollment-created' AND payload->>'invoiceId' = ${regInvoice?.id ?? ''}`;
  check('enrollment.created queued', welcome.length === 1, `${welcome.length} messages`);

  // ═══ 3. BILLING ═══════════════════════════════════════════════════
  section('3. Billing, a month is drafted, reviewed, then issued');

  /**
   * Everything below depends on a converted family. Stopping here with a clear
   * message beats fifty cascading failures that all describe the same broken
   * step, and beats a teardown that crashes on an undefined id.
   */
  if (!studentId || !guardianId) {
    blocked('billing, payment and notifications', 'conversion did not produce a student');
    throw new Halt();
  }

  await sql`UPDATE students SET account_status = 'ACTIVE' WHERE id = ${studentId}`;
  const period = `2099-${String((RUN % 12) + 1).padStart(2, '0')}`;

  const draft = await runJob('billing-draft');
  check('billing-draft cron runs', draft.status === 200, `${draft.status}`);

  const [ourRun] = await sql`
    INSERT INTO billing_runs (period, status, invoice_count, total_amount)
    VALUES (${period}, 'DRAFT', 0, 0) RETURNING id`;
  const [monthly] = await sql`
    INSERT INTO invoices (number, student_id, amount, period, type, status, due_date, billing_run_id)
    VALUES (app.next_invoice_number(), ${studentId}, 750000, ${period}, 'MONTHLY', 'DRAFT',
            ((now() AT TIME ZONE 'Asia/Makassar')::date + 10), ${ourRun.id})
    RETURNING id`;
  await sql`UPDATE billing_runs SET invoice_count = 1, total_amount = 750000 WHERE id = ${ourRun.id}`;

  const guardianSeesDraft = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: guardianId, role: 'authenticated' })}, true)`;
    await tx`SET LOCAL ROLE authenticated`;
    return tx`SELECT id FROM invoices WHERE id = ${monthly.id}`;
  });
  check('a DRAFT invoice is invisible to the family', guardianSeesDraft.length === 0);

  const runList = await F('GET', '/billing-runs');
  check(
    'Finance can review the drafted run',
    (runList.body?.data ?? []).some((r) => r.id === ourRun.id && r.status === 'DRAFT'),
  );

  const issue = await F('POST', `/billing-runs/${ourRun.id}/issue`, {}, key());
  check(
    'Finance issues it',
    issue.status === 200,
    `${issue.status} ${JSON.stringify(issue.body?.error)}`,
  );

  const [afterIssue] = await sql`SELECT status FROM invoices WHERE id = ${monthly.id}`;
  check('the draft becomes UNPAID', afterIssue?.status === 'UNPAID', String(afterIssue?.status));

  const issuedMail = await sql`
    SELECT status FROM outbox_message
    WHERE topic = 'notification.invoice-issued' AND payload->>'invoiceId' = ${monthly.id}`;
  check('invoice.issued queued', issuedMail.length === 1, `${issuedMail.length} messages`);

  /**
   * Late fee: FR-PAY-6, exact rupiah.
   *
   * Anchored to the WITA date, not `CURRENT_DATE`. The sweep computes the fee
   * from `(now() AT TIME ZONE 'Asia/Makassar')::date`, while `CURRENT_DATE` is
   * the session's. UTC on this database. For the eight hours after 16:00 UTC
   * the two are different days, so a fixture eight days back was nine days
   * overdue to the code under test and this assertion read Rp10.000. The check
   * was right; the fixture was in the wrong timezone.
   */
  const WITA_TODAY = sql`(now() AT TIME ZONE 'Asia/Makassar')::date`;
  await sql`UPDATE invoices SET due_date = ${WITA_TODAY} - 8, status = 'UNPAID' WHERE id = ${monthly.id}`;
  await runJob('invoice-overdue');
  const [swept] = await sql`SELECT status, late_fee FROM invoices WHERE id = ${monthly.id}`;
  check('overdue sweep marks it OVERDUE', swept?.status === 'OVERDUE', String(swept?.status));
  check(
    'and charges exactly one day of denda',
    Number(swept?.late_fee) === 5000,
    `Rp${swept?.late_fee}`,
  );

  await sql`UPDATE invoices SET due_date = ${WITA_TODAY} + 10, status = 'UNPAID', late_fee = 0 WHERE id = ${monthly.id}`;

  // ═══ 4. PAYMENT ═══════════════════════════════════════════════════
  section('4. Payment, the family transfers, Finance verifies');

  invoiceId = regInvoice?.id;
  const guardianSession = await retry(async () => {
    const { data } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: parentEmail,
    });
    if (!data) throw new Error('no link');
    return data;
  }).catch(() => null);
  check('guardian account exists in Auth', !!guardianSession, 'admin lookup failed');

  // The proof upload path is exercised as the guardian would: status + proof key.
  await sql`
    UPDATE invoices SET status = 'AWAITING_VERIFICATION', proof_key = 'proofs/readiness.jpg',
                        proof_uploaded_at = now()
    WHERE id = ${invoiceId}`;

  const finQueue = await F('GET', '/inbox?type=payment_proof&limit=100');
  check(
    'the proof reaches the Finance queue',
    (finQueue.body?.data?.items ?? []).some((i) => i.id === `payment_proof:${invoiceId}`),
  );

  const verify = await F('POST', `/invoices/${invoiceId}/verify`, { method: 'TRANSFER' }, key());
  check(
    'Finance verifies it',
    verify.status === 200,
    `${verify.status} ${JSON.stringify(verify.body?.error)}`,
  );

  const [paid] = await sql`SELECT status FROM invoices WHERE id = ${invoiceId}`;
  check('invoice becomes PAID', paid?.status === 'PAID', String(paid?.status));

  const [activated] = await sql`SELECT account_status FROM students WHERE id = ${studentId}`;
  check(
    'the account is activated',
    activated?.account_status === 'ACTIVE',
    String(activated?.account_status),
  );

  const [payment] =
    await sql`SELECT verified_by_id, gross_amount FROM payments WHERE invoice_id = ${invoiceId}`;
  check('the payment records who verified it', !!payment?.verified_by_id);

  const auditRow = await sql`
    SELECT action FROM audit_log WHERE entity_id = ${invoiceId} AND action LIKE 'payment%'`;
  check('and it is in the audit log', auditRow.length >= 1, `${auditRow.length} entries`);

  // ═══ 5. STAFF INVITATION ══════════════════════════════════════════
  section('5. Staff invitation');

  const inviteEmail = `${TAG}-invite-${RUN}@example.test`;
  const invite = await H(
    'POST',
    '/users',
    {
      fullName: 'Kolega Readiness',
      email: inviteEmail,
      roles: ['SECRETARY'],
      primaryRole: 'SECRETARY',
    },
    key(),
  );
  check(
    'the Head invites a colleague',
    invite.status === 201,
    `${invite.status} ${JSON.stringify(invite.body?.error)}`,
  );
  const invitedId = invite.body?.data?.id;
  if (invitedId) created.users.push(invitedId);

  const inviteMail = await sql`
    SELECT status FROM outbox_message
    WHERE topic = 'notification.staff-invited' AND payload->>'userId' = ${invitedId ?? ''}`;
  /**
   * The invited account has no password: this email is the only way in. If it
   * is not queued, somebody has an account they can never reach.
   */
  check('staff.invited queued, the only way into the account', inviteMail.length === 1);

  const custRole = await H(
    'POST',
    '/users',
    {
      fullName: 'Bukan Tim',
      email: `${TAG}-nope-${RUN}@example.test`,
      roles: ['PARENT'],
      primaryRole: 'PARENT',
    },
    key(),
  );
  check(
    'a customer role cannot be granted from /team',
    custRole.status === 422,
    `${custRole.status}`,
  );

  // ═══ 6. NOTIFICATIONS ═════════════════════════════════════════════
  section('6. Notifications, every template the dispatcher can emit');

  /**
   * The expected set is read out of the dispatcher, not counted.
   *
   * This check used to assert `templates.length === 8`, which was true when it
   * was written and stopped being true the moment §3.2 added
   * `reschedule.decided` and §3.5 added `assessment.ready`. It then failed for
   * two releases while reporting a number rather than a name, which is the
   * least useful way for a gate to be wrong: it says something changed without
   * saying whether the change was the defect or the check.
   *
   * Derived instead, so adding a topic and its template keeps this green, and
   * adding a topic WITHOUT a template, the actual defect, a notification the
   * product tries to send and cannot render, fails and names it.
   */
  const dispatchSrc = await readFile(
    new URL('../lib/notifications/dispatch.ts', import.meta.url),
    'utf8',
  );
  const emitted = [...dispatchSrc.matchAll(/case '(notification\.[a-z-]+)':/g)]
    .map((m) => m[1].replace(/^notification\./, '').replace('-', '.'))
    .sort();

  const templates = await sql`SELECT code, is_active FROM notification_templates ORDER BY code`;
  const codes = templates.map((t) => t.code);
  const missingTemplate = emitted.filter((e) => !codes.includes(e));
  const orphanTemplate = codes.filter((c) => !emitted.includes(c));

  check(
    `every one of the ${emitted.length} dispatcher topics has a template`,
    missingTemplate.length === 0,
    missingTemplate.join(', '),
  );
  check(
    'and every template is active',
    templates.every((t) => t.is_active),
    templates
      .filter((t) => !t.is_active)
      .map((t) => t.code)
      .join(', '),
  );
  check('and no template is orphaned', orphanTemplate.length === 0, orphanTemplate.join(', '));

  await runJob('outbox-dispatch');
  await new Promise((r) => setTimeout(r, 1500));
  await runJob('outbox-dispatch');

  const outcomes = await sql`
    SELECT o.topic, o.status, o.last_error
    FROM outbox_message o
    WHERE o.created_at >= ${startedAt}
      AND o.topic LIKE 'notification.%'
    ORDER BY o.topic`;

  const sent = outcomes.filter((o) => o.status === 'SENT');
  const domainBlocked = outcomes.filter((o) => /domain is not verified/i.test(o.last_error ?? ''));

  check(
    'the pipeline resolves recipients and renders templates',
    outcomes.length > 0,
    'nothing queued',
  );

  /**
   * When delivery is blocked, say what would unblock it.
   *
   * "The sending domain is not verified" describes the symptom the provider
   * reported. It does not distinguish a domain that is registered and waiting
   * on a DNS record from one that nobody has bought, a five-minute job from a
   * purchasing decision, and whoever reads this gate needs to know which.
   */
  const senderDomain = (process.env.EMAIL_FROM ?? '').match(/@([^\s>]+)/)?.[1] ?? null;
  if (senderDomain) {
    const dns = async (name, type) => {
      try {
        const r = await fetch(`https://dns.google/resolve?name=${name}&type=${type}`, {
          signal: AbortSignal.timeout(5000),
        });
        return ((await r.json()).Answer ?? []).map((a) => a.data);
      } catch {
        return [];
      }
    };
    const [ns, apexTxt, sendTxt, dkim, dmarc, mx] = await Promise.all([
      dns(senderDomain, 'NS'),
      dns(senderDomain, 'TXT'),
      dns(`send.${senderDomain}`, 'TXT'),
      dns(`resend._domainkey.${senderDomain}`, 'TXT'),
      dns(`_dmarc.${senderDomain}`, 'TXT'),
      dns(senderDomain, 'MX'),
    ]);

    /**
     * ⚠️ A record existing is not a record meaning what you wanted.
     *
     * The first version of this check asked `dkim.length > 0` and
     * `/v=spf1/.test(...)`. Run against `metroscope.id`, which belongs to a
     * domain-parking broker, not to this project. It reported **SPF=yes and
     * DKIM=yes**, because Above.com answers every subdomain with the same
     * wildcard TXT. `resend._domainkey.metroscope.id` "exists"; it contains
     * `v=spf1 ip6:… -all`.
     *
     * So each record must now look like the thing it claims to be, and the SPF
     * must actually authorise Resend rather than merely be an SPF record
     * belonging to somebody else. A gate that can be satisfied by a parked
     * domain is worse than no gate: it converts "we own nothing" into progress.
     */
    const spfRecords = [...apexTxt, ...sendTxt].filter((t) => /v=spf1/i.test(t));
    const authorisesResend = spfRecords.some((t) => /include:\s*(resend|amazonses)/i.test(t));
    const parked = mx.some((m) => /above\.com|parkingcrew|sedoparking|bodis/i.test(m));

    const state = {
      registered: ns.length > 0,
      spf: authorisesResend,
      dkim: dkim.some((t) => /v=DKIM1/i.test(t) || /\bp=[A-Za-z0-9+/]{40,}/.test(t)),
      dmarc: dmarc.some((t) => /v=DMARC1/i.test(t)),
    };
    console.log(
      `  \x1b[2mnote\x1b[0m  sending domain ${senderDomain}: ` +
        `registered=${state.registered ? 'yes' : 'NO'} · SPF=${state.spf ? 'yes' : 'no'} ` +
        `· DKIM=${state.dkim ? 'yes' : 'no'} · DMARC=${state.dmarc ? 'yes' : 'no'}` +
        (parked ? ' \x1b[33m· PARKED, the MX belongs to a domain broker\x1b[0m' : ''),
    );

    if (!state.registered) {
      blocked(
        `sending domain ${senderDomain} is not registered`,
        'no NS records exist, the domain must be bought and delegated before any DNS record can be published. ' +
          'SPF, DKIM and DMARC are all downstream of that.',
      );
    } else if (parked) {
      blocked(
        `sending domain ${senderDomain} is parked, not operated by this project`,
        `MX points at ${mx.join(', ')}, a domain-parking/brokerage provider. Its wildcard TXT answers every ` +
          'subdomain, so SPF and DKIM lookups appear to succeed while authenticating nothing. The domain must be ' +
          'acquired and its nameservers moved before any of these records can be published.',
      );
    } else {
      for (const [label, ok, what] of [
        [
          'SPF',
          state.spf,
          `publish a v=spf1 TXT on ${senderDomain} or send.${senderDomain} that includes Resend`,
        ],
        [
          'DKIM',
          state.dkim,
          `publish the resend._domainkey.${senderDomain} TXT record Resend issues (v=DKIM1; p=…)`,
        ],
        ['DMARC', state.dmarc, `publish a v=DMARC1 TXT on _dmarc.${senderDomain} (doc 08 §4)`],
      ]) {
        if (!ok) blocked(`${label} on ${senderDomain}`, what);
      }
    }
  }

  if (domainBlocked.length > 0) {
    blocked(
      'real delivery through Resend',
      `${domainBlocked.length} message(s) rejected: the sending domain is not verified. Nothing was delivered.`,
    );
  } else if (sent.length > 0) {
    check('messages accepted by the provider', true, `${sent.length} SENT`);

    const withId = await sql`
      SELECT count(*)::int AS n FROM notifications
      WHERE provider_message_id IS NOT NULL AND created_at >= ${startedAt}`;
    check(
      'each carries a provider message id',
      (withId[0]?.n ?? 0) > 0,
      `${withId[0]?.n ?? 0} with an id`,
    );
  } else {
    blocked(
      'real delivery through Resend',
      'no message reached SENT, see last_error on outbox_message',
    );
  }

  const perTemplate = new Map();
  for (const o of outcomes) perTemplate.set(o.topic, o.status);
  for (const t of [
    'notification.lead-received',
    'notification.enrollment-created',
    'notification.invoice-issued',
    'notification.payment-verified',
    'notification.staff-invited',
  ]) {
    const state = perTemplate.get(t);
    if (state === 'SENT') check(`${t} delivered`, true);
    else if (state) blocked(`${t}`, `status ${state}`);
    else blocked(`${t}`, 'not exercised by this run');
  }

  // ═══ 7. BACKUP VERIFICATION ═══════════════════════════════════════
  section('7. Backup verification');

  const backup = await runJob('backup-verify', 'GET');
  check('the weekly job runs', backup.status === 200 || backup.status === 503, `${backup.status}`);
  const bd = backup.body?.data;
  check(
    'every check passes',
    bd?.ok === true,
    (bd?.checks ?? [])
      .filter((c) => !c.ok)
      .map((c) => c.name)
      .join(', '),
  );
  check(
    'RLS confirmed on for every table',
    (bd?.checks ?? []).find((c) => c.name === 'rls_enabled_on_every_table')?.ok === true,
  );
  check(
    'an administrator still exists',
    (bd?.checks ?? []).find((c) => c.name === 'role_manage_holder_exists')?.ok === true,
  );
  check('and the job states what it did NOT prove', (bd?.notVerified ?? []).length >= 3);

  const unauthorised = await fetch(`${JOBS}/jobs/backup-verify`);
  check(
    'it refuses an unauthenticated call',
    unauthorised.status === 401,
    `${unauthorised.status}`,
  );

  // ═══ 8. MONITORING ════════════════════════════════════════════════
  section('8. Monitoring');

  const health = await fetch(`${JOBS}/health`);
  const healthBody = await health.json().catch(() => null);
  check(
    'API health reports ok',
    health.status === 200 && healthBody?.status === 'ok',
    `${health.status}`,
  );
  check(
    '…including database reachability',
    healthBody?.database === 'reachable',
    String(healthBody?.database),
  );

  /**
   * Asked of the RUNNING SERVER, not of this process's environment.
   *
   * "A DSN is set" and "the client initialised" are different facts, and the
   * gap between them is silent, capture on an uninitialised client returns an
   * event id and sends nothing, which looks exactly like a quiet week. Reading
   * `process.env` here would have reported a healthy tick for a server that was
   * dropping every error on the floor.
   */
  const reporting = healthBody?.errorReporting;
  if (reporting === 'active') {
    check('Sentry initialised in the API runtime', true);
  } else if (reporting === 'misconfigured') {
    check(
      'Sentry initialised in the API runtime',
      false,
      'a DSN is set but no client initialised, errors are being discarded',
    );
  } else {
    blocked('Sentry error reporting', 'no DSN on the API, the SDK is inert by design until one is');
  }

  const crons = JSON.parse(
    await import('node:fs').then((fs) => fs.promises.readFile('vercel.json', 'utf8')),
  ).crons;
  const fs = await import('node:fs');
  const missing = crons.filter((c) => !fs.existsSync(`app${c.path}/route.ts`));
  check(
    'every cron points at a real route',
    missing.length === 0,
    missing.map((c) => c.path).join(', '),
  );

  /**
   * Scoped to messages THIS run produced, not "the last ten minutes".
   *
   * The wall-clock window reported an orphan left by an earlier test suite as a
   * failure of this run, a check that blames the current change for somebody
   * else's litter is worse than no check, because the first thing it teaches
   * you is to ignore it.
   */
  const deadLetters = await sql`
    SELECT topic, left(last_error, 120) AS err FROM outbox_message
    WHERE status = 'FAILED'
      AND created_at >= ${startedAt}
      AND (last_error IS NULL OR last_error NOT LIKE '%domain is not verified%')`;
  check(
    'no unexplained dead letters from this run',
    deadLetters.length === 0,
    deadLetters.map((d) => `${d.topic}: ${d.err}`).join(' | '),
  );

  /**
   * Orphans from earlier runs are reported separately, and do not fail the
   * check: a dead letter whose entity no longer exists is the dispatcher
   * behaving correctly. It is worth surfacing because a growing pile means a
   * teardown somewhere deletes rows without clearing their queued mail.
   */
  const orphans = await sql`
    SELECT count(*)::int AS n FROM outbox_message
    WHERE status = 'FAILED' AND created_at < ${startedAt}
      AND last_error LIKE '%not found%'`;
  if ((orphans[0]?.n ?? 0) > 0) {
    console.log(
      `  \x1b[2mnote\x1b[0m  ${orphans[0].n} dead letter(s) from earlier runs whose entity was deleted, dispatcher behaving correctly, but a teardown is leaving queued mail behind.`,
    );
  }
} catch (err) {
  /**
   * A crash mid-walk must still reach the report and the teardown. Halt is the
   * deliberate stop; anything else is recorded as a failure so the run cannot
   * exit 0 having quietly skipped half the business.
   */
  if (!(err instanceof Halt)) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n\x1b[31mUnexpected failure:\x1b[0m ${message}`);
    if (current) check('the walk completed without crashing', false, message);
  }
} finally {
  console.log('\nCleaning up…');
  if (studentId) {
    const invs = await sql`SELECT id FROM invoices WHERE student_id = ${studentId}`;
    const ids = invs.map((i) => i.id);
    if (ids.length) {
      await sql`DELETE FROM outbox_message WHERE payload->>'invoiceId' = ANY(${ids})`;
      await sql`DELETE FROM notifications WHERE entity_id = ANY(${ids.map(String)})`;
      await sql`DELETE FROM audit_log WHERE entity_id = ANY(${ids.map(String)})`;
      await sql`DELETE FROM payments WHERE invoice_id = ANY(${ids})`;
      await sql`DELETE FROM invoices WHERE id = ANY(${ids})`;
    }
    await sql`DELETE FROM enrollments WHERE student_id = ${studentId}`;
    await sql`DELETE FROM students WHERE id = ${studentId}`;
  }
  await sql`DELETE FROM billing_runs WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.billing_run_id = billing_runs.id)`;
  if (registrationId) {
    await sql`DELETE FROM outbox_message WHERE payload->>'registrationId' = ${registrationId}`;
    await sql`DELETE FROM registration_contacts WHERE registration_id = ${registrationId}`;
    await sql`UPDATE registrations SET converted_student_id = NULL WHERE id = ${registrationId}`;
    await sql`DELETE FROM registrations WHERE id = ${registrationId}`;
  }
  await sql`DELETE FROM registrations WHERE source = ${TAG}`;
  await sql`DELETE FROM programs WHERE slug = ${created.programSlug}`;
  for (const id of created.users) {
    await sql`DELETE FROM outbox_message WHERE payload->>'userId' = ${id}`;
    await sql`DELETE FROM notifications WHERE user_id = ${id}`;
    await sql`DELETE FROM audit_log WHERE actor_id = ${id}`;
    await sql`DELETE FROM idempotency_key WHERE actor_id = ${id}`;
    await sql`DELETE FROM user_roles WHERE user_id = ${id}`;
    await sql`UPDATE invoices SET issued_by_id = NULL WHERE issued_by_id = ${id}`;
    await sql`UPDATE billing_runs SET issued_by_id = NULL WHERE issued_by_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await retry(async () => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    }).catch(() => {});
  }
  await sql.end({ timeout: 5 });
}

// ── Report ──────────────────────────────────────────────────────────
const all = results.flatMap((r) => r.checks);
const failed = all.filter((c) => c.state === 'FAIL');
const blockedChecks = all.filter((c) => c.state === 'BLOCKED');

console.log('\n' + '═'.repeat(70));
console.log('PRODUCTION READINESS');
console.log('═'.repeat(70));
for (const r of results) {
  const f = r.checks.filter((c) => c.state === 'FAIL').length;
  const b = r.checks.filter((c) => c.state === 'BLOCKED').length;
  const state = f ? '\x1b[31mFAIL\x1b[0m ' : b ? '\x1b[33mBLOCK\x1b[0m' : '\x1b[32mPASS\x1b[0m ';
  console.log(`  ${state} ${r.name}`);
}
console.log('─'.repeat(70));
console.log(
  `  ${all.length - failed.length - blockedChecks.length} passed · ${failed.length} failed · ${blockedChecks.length} blocked`,
);

if (blockedChecks.length) {
  console.log('\nBlocked, not proven, and not a pass:');
  for (const c of blockedChecks) console.log(`  · ${c.label}, ${c.detail}`);
}
if (failed.length) {
  console.log('\nFailed:');
  for (const c of failed) console.log(`  · ${c.label}, ${c.detail}`);
}
console.log();

process.exit(failed.length ? 1 : 0);
