import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Prove that email is ACTUALLY DELIVERED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run verify:email -- you@yourdomain.com
 *
 * Everything else in this repo proves the pipeline *runs*: outbox → claim →
 * render → record. None of it proves an email arrived, because without
 * RESEND_API_KEY the channel is a dev sink that logs and returns success.
 *
 * This drives the REAL path, a real registration, the real outbox, the real
 * cron sweeper, the real channel, and then reports the provider's message id.
 * A message id means Resend accepted it. Nothing else in this codebase can tell
 * you that, and email is the only outbound channel there is (doc 08 §4).
 *
 * Requires: the API running, RESEND_API_KEY set, and EMAIL_FROM on a domain
 * verified in Resend. An unverified sender fails with a 4xx that this code
 * correctly treats as permanent. It will not retry, and it will say so.
 */
loadEnvLocal();

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('\nUsage: npm run verify:email -- you@yourdomain.com\n');
  process.exit(1);
}

const API = process.env.API_TEST_URL?.replace(/\/v1$/, '') ?? 'http://localhost:3000/api';
const CRON = required('CRON_SECRET');
const sql = postgres(required('DIRECT_URL'), { max: 1 });

const usingResend = Boolean(process.env.RESEND_API_KEY);
console.log(
  `\nChannel : ${usingResend ? 'Resend (real send)' : 'DEV SINK. Nothing will be delivered'}`,
);
console.log(`From    : ${process.env.EMAIL_FROM ?? '(default)'}`);
console.log(`To      : ${to}\n`);

if (!usingResend) {
  console.log('RESEND_API_KEY is not set, so this run cannot prove delivery.');
  console.log('Set it in .env.local, restart the API, and run this again.\n');
}

let leadId;
try {
  const [program] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES ('verify-email-prog', 'Olimpiade Matematika', 'ACADEMIC', ARRAY['SMP'], 750000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name
    RETURNING id`;

  const [lead] = await sql`
    INSERT INTO registrations
      (child_name, parent_name, parent_phone, parent_email, level, type, program_id, source, campaign)
    VALUES ('Uji Kirim', 'Penerima Uji', ${`0899${Math.floor(1e6 + Math.random() * 8e6)}`},
            ${to}, 'SMP', 'CONSULTATION', ${program.id}, 'verify', 'verify-email')
    RETURNING id`;
  leadId = lead.id;

  const [msg] = await sql`
    INSERT INTO outbox_message (topic, payload)
    VALUES ('notification.lead-received', ${JSON.stringify({ registrationId: leadId })}::jsonb)
    RETURNING id`;
  console.log(`queued outbox message ${msg.id}`);

  const res = await fetch(`${API}/jobs/outbox-dispatch`, {
    headers: { authorization: `Bearer ${CRON}` },
  });
  if (!res.ok) throw new Error(`sweeper returned ${res.status}, is the API running?`);
  console.log(`sweeper processed ${(await res.json()).data.processed}`);

  const [outbox] = await sql`SELECT status, last_error FROM outbox_message WHERE id = ${msg.id}`;
  const [note] = await sql`
    SELECT status, provider_message_id, last_error, payload
    FROM notifications WHERE entity_id = ${leadId}`;

  console.log(
    `\noutbox        : ${outbox?.status}${outbox?.last_error ? `, ${outbox.last_error}` : ''}`,
  );
  console.log(
    `notification  : ${note?.status ?? 'NONE'}${note?.last_error ? `, ${note.last_error}` : ''}`,
  );
  console.log(`subject       : ${note?.payload?.subject ?? '-'}`);
  console.log(`provider id   : ${note?.provider_message_id ?? '(none)'}\n`);

  if (note?.provider_message_id) {
    console.log(`✅ Resend accepted it. Check ${to}, and check spam, because that is`);
    console.log('   exactly the failure this channel cannot afford (doc 08 §4.1).\n');
  } else if (usingResend) {
    console.log(
      '❌ No provider message id. The send did not reach Resend, see the errors above.\n',
    );
    process.exitCode = 1;
  }
} finally {
  await sql`DELETE FROM notifications WHERE entity_id = ${leadId ?? null}`;
  await sql`DELETE FROM outbox_message WHERE payload->>'registrationId' = ${leadId ?? null}`;
  await sql`DELETE FROM registrations WHERE campaign = 'verify-email'`;
  await sql`DELETE FROM programs WHERE slug = 'verify-email-prog'`;
  await sql.end({ timeout: 5 });
}
