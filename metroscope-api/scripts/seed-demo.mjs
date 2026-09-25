import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * Demo leads, for looking at `/leads` with something in it.
 *
 *   npm run db:seed:demo          # insert
 *   npm run db:seed:demo -- clear # remove
 *
 * Separate from `db:seed` and never run automatically, because these rows carry
 * `source` and `campaign` values. Attribution is what makes "which channel
 * produces paying students?" answerable (FR-LEAD-2), and fake rows sitting in
 * that data quietly corrupt the one metric doc 13 cares most about.
 *
 * Every row is tagged `campaign = 'demo-seed'`, which is both how `clear` finds
 * them and how you spot them in a funnel report.
 */
loadEnvLocal();

const sql = postgres(required('DIRECT_URL'), { max: 1, connect_timeout: 15 });
const TAG = 'demo-seed';

async function clear() {
  await sql`
    DELETE FROM registration_contacts
    WHERE registration_id IN (SELECT id FROM registrations WHERE campaign = ${TAG})`;
  const removed = await sql`DELETE FROM registrations WHERE campaign = ${TAG} RETURNING id`;
  await sql`DELETE FROM programs WHERE slug LIKE 'demo-%'`;
  console.log(`removed ${removed.length} demo lead(s)`);
}

async function insert() {
  const [osn] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES ('demo-osn', 'Olimpiade Sains', 'ACADEMIC', ARRAY['SMP','SMA'], 750000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`;
  const [debat] = await sql`
    INSERT INTO programs (slug, name, category, levels, price_monthly, status)
    VALUES ('demo-debat', 'Debat & Public Speaking', 'NON_ACADEMIC', ARRAY['SMA'], 600000, 'PUBLISHED')
    ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`;

  const rows = [
    [
      'Farrel Ahmad',
      'Bunda Sinta',
      '081211112222',
      'SMPN 3 Jakarta',
      'SMP',
      'DIRECT',
      osn.id,
      'NEW',
      'instagram',
      null,
    ],
    [
      'Kirana Salsabila',
      'Bunda Ayu',
      '081333334444',
      'SMAN 8 Jakarta',
      'SMA',
      'CONSULTATION',
      debat.id,
      'NEW',
      'google',
      null,
    ],
    [
      'Bagas Nugroho',
      'Ayah Rudi',
      '081455556666',
      'SMPN 5 Jakarta',
      'SMP',
      'CONSULTATION',
      osn.id,
      'CONSULTING',
      'referral',
      null,
    ],
    [
      'Rizky Maulana',
      'Bunda Fitri',
      '081699990000',
      'SMPN 1 Depok',
      'SMP',
      'CONSULTATION',
      osn.id,
      'NURTURING',
      'instagram',
      3,
    ],
  ];

  for (const [
    child,
    parent,
    phone,
    school,
    level,
    type,
    pid,
    status,
    source,
    followUpDays,
  ] of rows) {
    await sql`
      INSERT INTO registrations
        (child_name, parent_name, parent_phone, parent_email, school, level, type,
         program_id, status, source, campaign, follow_up_at)
      VALUES (${child}, ${parent}, ${phone},
              ${child.split(' ')[0].toLowerCase() + '@example.test'},
              ${school}, ${level}, ${type}, ${pid}, ${status}, ${source}, ${TAG},
              ${followUpDays ? sql`now() + ${`${followUpDays} days`}::interval` : null})`;
  }
  console.log(`seeded ${rows.length} demo leads (campaign = '${TAG}')`);
  console.log(`remove them with: npm run db:seed:demo -- clear`);
}

try {
  if (process.argv.includes('clear')) await clear();
  else {
    await clear(); // idempotent: re-running replaces rather than duplicates
    await insert();
  }
} finally {
  await sql.end({ timeout: 5 });
}
