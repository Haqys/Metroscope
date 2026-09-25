import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Email pipeline, integration tests (doc 14 §1.7 exit criterion).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REQUIRES A RUNNING API on :3000.
 *
 * Exercises outbox → claim → render → send → record, plus the parts that only
 * matter when things go wrong: at-least-once delivery not producing duplicates,
 * retries backing off, and a permanently broken message dying visibly instead of
 * looping forever.
 *
 * Failure is injected by deactivating the template rather than by stubbing the
 * channel, because the worker runs inside the server process where a test cannot
 * reach it. That path is genuinely representative: a missing or deactivated
 * template is one of the real ways this breaks in production.
 *
 *   npm run dev                  # in one terminal
 *   npm run test:notifications   # in another
 */
loadEnvLocal();

const JOBS = (process.env.API_TEST_URL ?? 'http://localhost:3000/api').replace(/\/v1$/, '');
const sql = postgres(required('DIRECT_URL'), { max: 1 });
const CRON_SECRET = required('CRON_SECRET');

let pass = 0,
  fail = 0;
const check = (n, ok, d = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? `, ${d}` : ''}`);
};

/** Invoke the sweeper the way Vercel Cron does. */
const sweep = async () => {
  const r = await fetch(`${JOBS}/jobs/outbox-dispatch`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

/** Invoke the QStash target for one specific message. */
const dispatchOne = async (outboxId) => {
  const r = await fetch(`${JOBS}/jobs/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${CRON_SECRET}` },
    body: JSON.stringify({ outboxId }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const TAG = 'notif-test';
let programId, leadId;

try {
  // ── fixtures ────────────────────────────────────────────────────────────
  const [p] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES (${`${TAG}-prog`}, 'Notif Test Program', 'ACADEMIC', ARRAY['SMP'], 500000, 'PUBLISHED')
    RETURNING id`;
  programId = p.id;

  const email = `${TAG}-parent-${Date.now()}@example.test`;
  const [lead] = await sql`
    INSERT INTO registrations
      (child_name, parent_name, parent_phone, parent_email, level, type, program_id, source, campaign)
    VALUES ('Anak Uji', 'Ibu Uji', ${`0812${Math.floor(1e8 + Math.random() * 8e8)}`},
            ${email}, 'SMP', 'CONSULTATION', ${programId}, 'test', ${TAG})
    RETURNING id`;
  leadId = lead.id;

  console.log('\nAuthentication');
  const unauth = await fetch(`${JOBS}/jobs/outbox-dispatch`);
  check('sweeper rejects an unauthenticated call', unauth.status === 401, `got ${unauth.status}`);

  console.log('\nHappy path');
  const [msg] = await sql`
    INSERT INTO outbox_message (topic, payload)
    VALUES ('notification.lead-received', ${JSON.stringify({ registrationId: leadId })}::jsonb)
    RETURNING id`;

  const first = await dispatchOne(msg.id);
  check(
    'dispatch processes the message',
    first.status === 200 && first.body?.data?.processed === true,
    JSON.stringify(first.body),
  );

  const [outbox1] =
    await sql`SELECT status, attempts, last_error FROM outbox_message WHERE id = ${msg.id}`;

  /**
   * This suite tests the PIPELINE, not the provider.
   *
   * With a real RESEND_API_KEY set, a send can legitimately fail for reasons
   * that say nothing about this code, most commonly an unverified sender
   * domain. Failing the suite for that would make it red for an environmental
   * reason and train everyone to ignore it.
   *
   * So a provider-config rejection is reported as a skip, and what gets asserted
   * instead is that the pipeline handled it CORRECTLY: dead on the first
   * attempt, with the reason recorded. That is the behaviour worth protecting.
   * Actual delivery is proven separately by `npm run verify:email`.
   */
  const providerRejected =
    outbox1.status === 'FAILED' && /resend \d+:/.test(outbox1.last_error ?? '');

  if (providerRejected) {
    console.log('  SKIP  outbox marked SENT, provider rejected the send:');
    console.log(`        ${(outbox1.last_error ?? '').slice(0, 160)}`);
    check(
      'a permanent provider error dies on the FIRST attempt, not after five',
      outbox1.attempts === 1,
      `attempts=${outbox1.attempts}`,
    );
    check('the provider error is recorded on the row', Boolean(outbox1.last_error));

    const [note] = await sql`
      SELECT status, last_error, dedupe_key FROM notifications WHERE entity_id = ${leadId}`;
    check('the notification is marked FAILED, not left PENDING', note?.status === 'FAILED');
    check(
      'the dedupe claim is KEPT on a permanent failure, so it is not retried',
      Boolean(note?.dedupe_key),
    );
  } else {
    check('outbox marked SENT', outbox1.status === 'SENT', JSON.stringify(outbox1));

    const notes = await sql`
      SELECT status, template, recipient_email, user_id, payload, sent_at, dedupe_key
      FROM notifications WHERE entity_id = ${leadId}`;
    check('one notification recorded', notes.length === 1, `n=${notes.length}`);
    check(
      'status SENT with a timestamp',
      notes[0]?.status === 'SENT' && Boolean(notes[0]?.sent_at),
    );
    check(
      'addressed to the parent',
      notes[0]?.recipient_email === email,
      notes[0]?.recipient_email,
    );
    check('user_id is NULL, a prospect has no account yet', notes[0]?.user_id === null);
    check('used the lead.received template', notes[0]?.template === 'lead.received');

    const subject = notes[0]?.payload?.subject ?? '';
    check(
      'subject rendered from the template with real values',
      subject === 'Pendaftaran Anak Uji sudah kami terima',
      subject,
    );
    check(
      'no unsubstituted placeholders survived',
      !JSON.stringify(notes[0]?.payload ?? {}).includes('{{'),
    );
  }

  console.log('\nAt-least-once delivery must not double-send');
  // Force the message back to PENDING, exactly as a duplicate QStash delivery
  // or a stale-lock recovery would leave it.
  await sql`UPDATE outbox_message SET status = 'PENDING', next_attempt_at = now() WHERE id = ${msg.id}`;
  await dispatchOne(msg.id);
  const after = await sql`SELECT count(*)::int AS n FROM notifications WHERE entity_id = ${leadId}`;
  check('still exactly one notification after a re-delivery', after[0].n === 1, `n=${after[0].n}`);

  console.log('\nRetry and backoff');
  await sql`UPDATE notification_templates SET is_active = false WHERE code = 'lead.received'`;
  const [broken] = await sql`
    INSERT INTO outbox_message (topic, payload)
    VALUES ('notification.lead-received', ${JSON.stringify({ registrationId: leadId })}::jsonb)
    RETURNING id`;

  await dispatchOne(broken.id);
  const [r1] = await sql`
    SELECT status, attempts, last_error, next_attempt_at > now() AS deferred
    FROM outbox_message WHERE id = ${broken.id}`;
  check('a failure returns the message to PENDING', r1.status === 'PENDING', JSON.stringify(r1));
  check('the attempt was counted', r1.attempts === 1, `attempts=${r1.attempts}`);
  check('the next attempt is deferred, not immediate', r1.deferred === true);
  check(
    'the reason is recorded for diagnosis',
    /template/i.test(r1.last_error ?? ''),
    r1.last_error,
  );

  console.log('\nA broken message dies visibly rather than looping forever');
  let final;
  for (let i = 0; i < 6; i++) {
    // Skip the backoff so the test does not wait hours.
    await sql`UPDATE outbox_message SET next_attempt_at = now() WHERE id = ${broken.id}`;
    await dispatchOne(broken.id);
    [final] =
      await sql`SELECT status, attempts, last_error FROM outbox_message WHERE id = ${broken.id}`;
    if (final.status === 'FAILED') break;
  }
  check('eventually FAILED', final?.status === 'FAILED', JSON.stringify(final));
  check('attempts are bounded (max 5)', final?.attempts <= 5, `attempts=${final?.attempts}`);
  check('the failure is kept, not deleted', Boolean(final?.last_error));

  // Restore before the recovery test.
  await sql`UPDATE notification_templates SET is_active = true WHERE code = 'lead.received'`;

  console.log('\nCrash recovery');
  const [stuck] = await sql`
    INSERT INTO outbox_message (topic, payload, status, locked_at)
    VALUES ('notification.lead-received', ${JSON.stringify({ registrationId: leadId })}::jsonb,
            'PROCESSING', now() - interval '30 minutes')
    RETURNING id`;
  await sweep();
  const [recovered] = await sql`SELECT status FROM outbox_message WHERE id = ${stuck.id}`;
  check(
    'a message abandoned mid-send is picked back up',
    recovered.status !== 'PROCESSING',
    `still ${recovered.status}`,
  );

  console.log('\nSweeper');
  const [pending] = await sql`
    INSERT INTO outbox_message (topic, payload)
    VALUES ('notification.lead-received', ${JSON.stringify({ registrationId: leadId })}::jsonb)
    RETURNING id`;
  const swept = await sweep();
  check(
    'cron sweep drains what QStash did not',
    swept.status === 200 && swept.body?.data?.processed >= 1,
    JSON.stringify(swept.body),
  );
  const [sweptRow] = await sql`SELECT status FROM outbox_message WHERE id = ${pending.id}`;
  // SENT when the provider accepted it, FAILED when it rejected the sender,
  // either way the sweeper resolved it rather than leaving it PENDING.
  check(
    'the pending message is resolved, not left in the queue',
    sweptRow.status !== 'PENDING' && sweptRow.status !== 'PROCESSING',
    sweptRow.status,
  );

  console.log('\nUnknown topics are not retried forever');
  const [unknown] = await sql`
    INSERT INTO outbox_message (topic, payload) VALUES ('notification.does-not-exist', '{}'::jsonb)
    RETURNING id`;
  await dispatchOne(unknown.id);
  const [unknownRow] = await sql`SELECT status FROM outbox_message WHERE id = ${unknown.id}`;
  check(
    'an unknown topic is dead-lettered, not marked delivered',
    unknownRow.status === 'FAILED',
    unknownRow.status,
  );
} finally {
  await sql`UPDATE notification_templates SET is_active = true WHERE code = 'lead.received'`;
  await sql`DELETE FROM notifications WHERE entity_id = ${leadId ?? null}`;
  await sql`DELETE FROM outbox_message WHERE payload->>'registrationId' = ${leadId ?? null}
            OR topic = 'notification.does-not-exist'`;
  await sql`DELETE FROM registrations WHERE campaign = ${TAG}`;
  await sql`DELETE FROM programs WHERE slug = ${`${TAG}-prog`}`;
  await sql.end({ timeout: 5 });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
