import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Production data reset, purge the demo, load the real roster.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run db:seed:production -- --confirm
 *
 * ⚠️ DESTRUCTIVE. Deletes every business row in the database. It refuses to run
 * without `--confirm`, and it refuses to delete an account it was not told to
 * keep, because "delete everything except the owner" is a sentence worth making
 * the code say out loud.
 *
 * ── What survives ──
 *
 *   roles · role_pages · role_actions   the authorisation model (Phase 0)
 *   notification_templates              the ten message templates
 *   the KEEP_EMAILS accounts            the Head who owns the system
 *
 * Everything else is demo data seeded by `db:seed:demo` or left behind by the
 * test suites, which create accounts on every run, 139 of the 140 accounts in
 * the database were `@example.test`.
 *
 * ── What it loads ──
 *
 * The real roster and competition data supplied by the business:
 *   · 43 students, with their Metroscope student numbers as slugs
 *   · 3 competitions with their real organisers, venues and timelines
 *   · the delegate list for each
 *
 * ── The guardian placeholder ──
 *
 * `students.user_id` is NOT NULL: every student needs a guardian account, and
 * the source documents contain no parent email addresses. Rather than invent 43
 * of them, which would be exactly the dummy data this script exists to remove,
 * and would create 43 real logins nobody controls, every student is attached
 * to ONE placeholder guardian that **cannot log in**: a `users` row with no
 * Supabase Auth account behind it.
 *
 * Students are therefore LIMITED, which is what doc 13's flow already means by
 * "registered but not yet activated". Attaching a real family is a matter of
 * moving `students.user_id` to their account when they are onboarded.
 */

loadEnvLocal();

if (!process.argv.includes('--confirm')) {
  console.error(`
\x1b[31mRefusing to run without --confirm.\x1b[0m

This deletes EVERY business row in ${new URL(required('DIRECT_URL')).hostname}
and replaces it with the production roster.

  npm run db:seed:production -- --confirm
`);
  process.exit(1);
}

/** The only accounts that survive the purge. */
const KEEP_EMAILS = (process.env.SEED_HEAD_EMAIL ? [process.env.SEED_HEAD_EMAIL] : []).map((e) =>
  e.toLowerCase(),
);

if (KEEP_EMAILS.length === 0) {
  console.error(
    '\x1b[31mSEED_HEAD_EMAIL is not set. There would be no account left to log in with.\x1b[0m',
  );
  process.exit(1);
}

const sql = postgres(required('DIRECT_URL'), { max: 1 });
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const log = (m) => console.log(m);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

// ═══════════════════════════════════════════════════════════════════════
//  THE REAL DATA
// ═══════════════════════════════════════════════════════════════════════

/**
 * The roster, verbatim from `data-siswa.pdf`.
 *
 * The student number is the business's own identifier and there is no column
 * for it, so it becomes the SLUG, the stable, unique, URL-safe key the app
 * already uses to address a student. Nothing is lost and no schema changes.
 */
const STUDENTS = [
  ['M100260701', 'Ajuba Yasser Barahakim Harahap'],
  ['M100260702', 'Alfi Nur Azizah'],
  ['M100260703', 'Alp Arslan Aziz'],
  ['M100260704', 'Angeliquit Vania Christabel'],
  ['M100260705', 'Anggita Zanitha Wahab'],
  ['M100260706', 'Aqila Dinarafiya Fernando'],
  ['M100260707', 'Asyraf Qaeser Hakim Kartiko'],
  ['M100260708', 'Athifa Azkiya Mumtaz'],
  ['M100260709', 'Aura Kirana'],
  ['M100260710', 'Aurelia Jocelyn Lau'],
  ['M100260711', 'Azura Faiha Atsilah'],
  ['M100260712', 'Bulan Putri Ayu'],
  ['M100260713', 'Cleon Arya Exsa'],
  ['M100260714', 'Devrieza Abdhie Negoro'],
  ['M100260715', 'Dionisia Advesa Amaris'],
  ['M100260716', 'Fara Muthia Jana'],
  ['M100260717', 'Fatihah Aida'],
  ['M100260718', 'Fauzia Zahrani'],
  ['M100260719', 'Freya Aerilyn Nur Santa'],
  ['M100260720', 'Ignatius Prabu Bekti Christian'],
  ['M100260721', 'Insyira Zalfa Zahira'],
  ['M100260722', 'Jihan Talita Ulfa Remonda'],
  ['M100260723', 'Ken Salma Rachel Sadiyah'],
  ['M100260724', 'Khansa Shahia Anantara'],
  ['M100260725', 'Luthfya Junaira Sudarso'],
  ['M100260726', 'M. Asfabian Barra Cetta'],
  ['M100260727', 'M. Naufal Rayyan Andhika'],
  ['M100260728', 'Mahira Alifa Fitya'],
  ['M100260729', 'Mardiana Yara Hafizhah Zas'],
  ['M100260730', 'Mikaela Holly Wijaya'],
  ['M100260731', 'Nadira Ayesha'],
  ['M100260732', 'Naswa Aesyara'],
  ['M100260733', 'Ni Putu Calysta'],
  ['M100260734', 'Ni Wayan Adenaya Dian Gayatri'],
  ['M100260735', 'Oktavianus Alexa Pratama'],
  ['M100260736', 'Princess Alicia'],
  ['M100260737', 'Priscilla Juvita Putri Nehe'],
  ['M100260738', 'Putri Syahirah Mahardika'],
  ['M100260739', 'Rani Handayani'],
  ['M100260740', 'Rania Shakayla Azzahra'],
  ['M100260741', 'Renata Nur Fadilah'],
  ['M100260742', 'Sekar Ayu Putri Pembayun'],
  ['M100260743', 'Sona Sultana'],
];

/**
 * Competitions, verbatim from `Data Perlombaan dan Siswa.pdf`.
 *
 * Dates are stored as instants at 00:00 WITA, the source gives calendar days,
 * and inventing a time of day would be inventing data. `registrationDeadline`
 * is the registration cut-off; `submissionDeadline` goes in `feeNote` because
 * the schema has one deadline field and the payment/submission date is a
 * different obligation worth keeping in front of whoever reads the record.
 *
 * The delegate names are the ROSTER spellings. Three differ between the two
 * documents, the competition sheet writes "Sekar Ayu", "Princess Alecia" and
 * "Felicia Rani Handayani", and the roster is treated as the master record.
 */
const COMPETITIONS = [
  {
    slug: 'isif-2026',
    name: '8th International Science and Invention Fair (ISIF) 2026',
    organizer: 'Indonesian Young Scientist Association (IYSA) & Universitas Indonesia',
    venue: 'Universitas Indonesia (UI), Depok, Jawa Barat, Indonesia',
    level: 'INTERNATIONAL',
    format: 'TEAM',
    mode: 'HYBRID',
    levels: ['SMP', 'SMA'],
    summary:
      'Kompetisi inovasi dan penelitian ilmiah internasional oleh IYSA bersama Universitas Indonesia.',
    description:
      '8th International Science and Invention Fair (ISIF) 2026 merupakan kompetisi inovasi dan ' +
      'penelitian ilmiah internasional yang diselenggarakan oleh Indonesian Young Scientist Association ' +
      '(IYSA) bekerja sama dengan Universitas Indonesia (UI). Kompetisi ini mempertemukan pelajar dan ' +
      'peneliti dari berbagai negara melalui sistem hybrid (online dan offline) untuk mempresentasikan ' +
      'hasil riset maupun inovasi mereka, sekaligus mendorong kolaborasi ilmiah, kepemimpinan, dan ' +
      'pengembangan solusi berbasis sains bagi tantangan global.',
    registrationDeadline: '2026-08-24',
    feeNote: 'Deadline pembayaran & submission: 31 Agustus 2026.',
    eventStart: '2026-10-12',
    eventEnd: '2026-10-17',
    delegates: [
      ['Kategori SMP', 'SMP', ['Naswa Aesyara', 'Insyira Zalfa Zahira', 'Dionisia Advesa Amaris']],
      [
        'Kategori SMA',
        'SMA',
        [
          'Mahira Alifa Fitya',
          'Putri Syahirah Mahardika',
          'Fara Muthia Jana',
          'Bulan Putri Ayu',
          'Angeliquit Vania Christabel',
          'Fauzia Zahrani',
        ],
      ],
    ],
  },
  {
    slug: 'wasisc-2026',
    name: 'World Agriculture, Strategic Studies and Innovation Science Competition (WASISC) 2026',
    organizer: 'Indonesian Young Scientist Association (IYSA) & SMA Taruna Nusantara Malang',
    venue: 'SMA Taruna Nusantara, Malang, Jawa Timur, Indonesia',
    level: 'INTERNATIONAL',
    format: 'TEAM',
    mode: 'OFFLINE',
    levels: ['SMP'],
    summary:
      'Kompetisi inovasi ilmiah internasional bidang pertanian, studi strategis dan keberlanjutan.',
    description:
      'World Agriculture, Strategic Studies and Innovation Science Competition (WASISC) 2026 merupakan ' +
      'kompetisi inovasi ilmiah internasional yang diselenggarakan oleh Indonesian Young Scientist ' +
      'Association (IYSA) bekerja sama dengan SMA Taruna Nusantara Malang. Kompetisi ini berfokus pada ' +
      'pengembangan solusi berbasis penelitian di bidang pertanian, studi strategis, keberlanjutan ' +
      'lingkungan, dan teknologi, sekaligus mendorong kolaborasi internasional serta kepemimpinan ' +
      'ilmiah bagi generasi muda.',
    registrationDeadline: '2026-09-04',
    feeNote: 'Deadline pembayaran & submission: 11 September 2026.',
    eventStart: '2026-10-23',
    eventEnd: '2026-10-26',
    delegates: [
      [
        'SMP I',
        'SMP',
        [
          'Anggita Zanitha Wahab',
          'Aqila Dinarafiya Fernando',
          'Alfi Nur Azizah',
          'Sona Sultana',
          'Sekar Ayu Putri Pembayun',
          'Aurelia Jocelyn Lau',
        ],
      ],
      [
        'SMP II',
        'SMP',
        [
          'Princess Alicia',
          'Aura Kirana',
          'Rani Handayani',
          'Cleon Arya Exsa',
          'Asyraf Qaeser Hakim Kartiko',
          'M. Asfabian Barra Cetta',
        ],
      ],
    ],
  },
  {
    slug: 'iid-2026',
    name: 'Indonesia Inventors Day (IID) 2026',
    organizer: 'Indonesian Invention and Innovation Promotion Association (INNOPA)',
    venue: 'SMESCO Exhibition Hall, Jakarta, Indonesia',
    level: 'INTERNATIONAL',
    format: 'TEAM',
    mode: 'OFFLINE',
    levels: ['SMA'],
    summary:
      'Pameran dan kompetisi inovasi internasional terbesar di Indonesia, diselenggarakan oleh INNOPA.',
    description:
      'Indonesia Inventors Day (IID) 2026 merupakan salah satu pameran dan kompetisi inovasi ' +
      'internasional terbesar di Indonesia yang diselenggarakan oleh Indonesian Invention and ' +
      'Innovation Promotion Association (INNOPA). Ajang ini menjadi wadah bagi para inovator, peneliti, ' +
      'ilmuwan, startup, institusi pendidikan, dan pelaku industri dari berbagai negara untuk ' +
      'memamerkan hasil inovasi, membangun kolaborasi internasional, serta membuka peluang ' +
      'komersialisasi melalui jejaring akademik dan industri.',
    registrationOpens: '2026-03-09',
    registrationDeadline: '2026-06-30',
    feeNote: 'Deadline submission dokumen: 31 Agustus 2026.',
    eventStart: '2026-10-03',
    eventEnd: '2026-10-06',
    delegates: [
      [
        'Kategori SMA I',
        'SMA',
        ['Angeliquit Vania Christabel', 'Putri Syahirah Mahardika', 'Priscilla Juvita Putri Nehe'],
      ],
    ],
  },
];

/**
 * A deadline is an INSTANT; an event day is a CALENDAR DAY.
 *
 * `registration_opens_at` and `registration_deadline` are `timestamptz`, so a
 * cut-off gets midnight WITA, the moment the door actually closes in Denpasar.
 *
 * `event_start` and `event_end` are `date`. Handing those a WITA instant makes
 * Postgres convert to the session zone (UTC) before truncating, which moves
 * every competition one day earlier: "3–6 Oktober" was stored as 2–5 October.
 * A calendar day has no timezone and must not be given one.
 */
const witaInstant = (d) => (d ? `${d}T00:00:00+08:00` : null);
const calendarDay = (d) => d ?? null;

try {
  // ═══ 1. WHO SURVIVES ═════════════════════════════════════════════════
  step('1. Accounts to keep');

  const keepers = await sql`
    SELECT id, email FROM users WHERE lower(email) = ANY(${KEEP_EMAILS})`;
  if (keepers.length === 0) {
    throw new Error(`None of ${KEEP_EMAILS.join(', ')} exist, refusing to empty the database.`);
  }
  for (const k of keepers) log(`  keep  ${k.email}`);
  const keepIds = keepers.map((k) => k.id);

  const head = keepers[0];

  // ═══ 2. PURGE ════════════════════════════════════════════════════════
  step('2. Deleting demo and test data');

  const before = await sql`
    SELECT (SELECT count(*)::int FROM users) users,
           (SELECT count(*)::int FROM students) students,
           (SELECT count(*)::int FROM competitions) competitions,
           (SELECT count(*)::int FROM articles) articles,
           (SELECT count(*)::int FROM sessions) sessions,
           (SELECT count(*)::int FROM invoices) invoices`;
  log(`  before: ${JSON.stringify(before[0])}`);

  /**
   * Child-first, because most foreign keys onto `users` are RESTRICT by design,
   * an audit trail whose actor can vanish is not an audit trail. That
   * protection has to be unwound deliberately here, which is the point: it
   * cannot happen by accident.
   *
   * `roles`, `role_pages`, `role_actions`, `notification_templates` and
   * `article_categories` are absent from this list on purpose. They are
   * CONFIGURATION, not data, every one of them is inserted by a migration
   * (`article_categories` by 0014), so deleting them contradicts "keep the
   * migrations intact" and takes the public site's article taxonomy with it.
   * The first run of this script did delete the categories, and `test:articles`
   * caught it: the CMS listed none and anon could read no taxonomy.
   */
  const ORDER = [
    'session_attendance',
    'reschedule_requests',
    'sessions',
    'session_series',
    'mentor_availability',
    'assessment_reactions',
    'assessment_criteria',
    'assessment_claims',
    'assessments',
    'progress',
    'material_progress',
    'material_assignments',
    'material_resources',
    'materials',
    'team_members',
    'teams',
    'competition_targets',
    'payments',
    'invoices',
    'billing_runs',
    'enrollments',
    'article_tags',
    'media_usage',
    'articles',
    'content_versions',
    'seo_meta',
    'redirects',
    'page_blocks',
    'pages',
    'faq_entries',
    'testimonials',
    'mentor_profiles',
    'competitions',
    'tags',
    'media_assets',
    'preview_grants',
    'form_submissions',
    'registration_contacts',
    'registrations',
    'notifications',
    'notification_preferences',
    'outbox_message',
    'idempotency_key',
    'activity_event',
    'audit_log',
    'students',
    'programs',
  ];

  for (const table of ORDER) {
    const r = await sql.unsafe(`DELETE FROM "${table}"`);
    if (r.count > 0) log(`  ${String(r.count).padStart(5)}  ${table}`);
  }

  /** Role grants for everybody but the keepers, then the accounts themselves. */
  const ur = await sql`DELETE FROM user_roles WHERE user_id <> ALL(${keepIds})`;
  log(`  ${String(ur.count).padStart(5)}  user_roles`);
  const du = await sql`DELETE FROM users WHERE id <> ALL(${keepIds})`;
  log(`  ${String(du.count).padStart(5)}  users`);

  // ── Supabase Auth ──
  step('3. Deleting the matching Supabase Auth accounts');
  let authDeleted = 0;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    if (!data.users.length) break;
    for (const u of data.users) {
      if (KEEP_EMAILS.includes((u.email ?? '').toLowerCase())) continue;
      await supabase.auth.admin.deleteUser(u.id).catch(() => {});
      authDeleted++;
    }
    if (data.users.length < 200) break;
    page++;
  }
  log(`  ${String(authDeleted).padStart(5)}  auth accounts`);

  // ═══ 4. THE PLACEHOLDER GUARDIAN ═════════════════════════════════════
  step('4. Creating the roster guardian placeholder');

  /**
   * A `users` row with NO Supabase Auth account behind it. Nothing can sign in
   * as this, because there is no password and no auth identity to reset, which
   * is precisely what a placeholder should be. `students.user_id` only needs a
   * row in `users`; the FK does not reach into `auth.users`.
   */
  const guardianId = crypto.randomUUID();
  const guardianEmail = 'roster-unassigned@metroscope.id';
  const [{ id: parentRoleId }] = await sql`SELECT id FROM roles WHERE code = 'PARENT'`;

  await sql`
    INSERT INTO users (id, email, full_name, display_name, status, primary_role_id)
    VALUES (${guardianId}, ${guardianEmail},
            'Roster Metroscope (belum ada wali)', 'Roster Metroscope',
            'INACTIVE', ${parentRoleId})`;
  await sql`INSERT INTO user_roles (user_id, role_id) VALUES (${guardianId}, ${parentRoleId})`;
  log(`  ${guardianEmail}, cannot sign in (no auth account), holds PARENT`);

  // ═══ 5. STUDENTS ═════════════════════════════════════════════════════
  step('5. Loading the student roster');

  /** Level is only known for students the competition sheet places in a category. */
  const levelOf = new Map();
  for (const c of COMPETITIONS) {
    for (const [, level, names] of c.delegates) {
      for (const n of names) levelOf.set(n, level);
    }
  }

  for (const [number, name] of STUDENTS) {
    await sql`
      INSERT INTO students (user_id, name, slug, level, join_date, account_status, student_status)
      VALUES (${guardianId}, ${name}, ${number.toLowerCase()},
              ${levelOf.get(name) ?? null}::school_level,
              current_date, 'LIMITED', 'ACTIVE')`;
  }
  log(`  ${STUDENTS.length} students · slug = student number · ${levelOf.size} with a known level`);

  // ═══ 6. COMPETITIONS ═════════════════════════════════════════════════
  step('6. Loading competitions and delegates');

  let targetCount = 0;
  const unmatched = [];

  for (const c of COMPETITIONS) {
    const [comp] = await sql`
      INSERT INTO competitions (slug, name, summary, description, organizer, venue,
                                level, format, mode, levels,
                                registration_opens_at, registration_deadline,
                                event_start, event_end, fee_note,
                                status, published_at, created_by_id, locale)
      VALUES (${c.slug}, ${c.name}, ${c.summary}, ${c.description}, ${c.organizer}, ${c.venue},
              ${c.level}::competition_level, ${c.format}::competition_format,
              ${c.mode}::competition_mode, ${c.levels}::text[],
              ${witaInstant(c.registrationOpens ?? null)}::timestamptz,
              ${witaInstant(c.registrationDeadline)}::timestamptz,
              ${calendarDay(c.eventStart)}::date,
              ${calendarDay(c.eventEnd)}::date,
              ${c.feeNote}, 'PUBLISHED', now(), ${head.id}, 'id')
      RETURNING id`;

    for (const [category, , names] of c.delegates) {
      for (const name of names) {
        const [student] = await sql`SELECT id FROM students WHERE name = ${name}`;
        if (!student) {
          unmatched.push(`${c.slug}: ${name}`);
          continue;
        }
        await sql`
          INSERT INTO competition_targets (student_id, competition_id, note, added_by_id)
          VALUES (${student.id}, ${comp.id}, ${category}, ${head.id})`;
        targetCount++;
      }
    }
    log(`  ${c.slug.padEnd(12)} ${c.delegates.reduce((n, d) => n + d[2].length, 0)} delegates`);
  }

  if (unmatched.length) {
    log(`\n  \x1b[31mUNMATCHED delegate names:\x1b[0m ${unmatched.join(', ')}`);
  }

  // ═══ 7. RESULT ═══════════════════════════════════════════════════════
  step('Result');
  const after = await sql`
    SELECT (SELECT count(*)::int FROM users) users,
           (SELECT count(*)::int FROM students) students,
           (SELECT count(*)::int FROM competitions) competitions,
           (SELECT count(*)::int FROM competition_targets) targets,
           (SELECT count(*)::int FROM articles) articles,
           (SELECT count(*)::int FROM sessions) sessions,
           (SELECT count(*)::int FROM invoices) invoices,
           (SELECT count(*)::int FROM roles) roles,
           (SELECT count(*)::int FROM notification_templates) templates`;
  log(`  ${JSON.stringify(after[0], null, 1)}`);

  const leftover = await sql`
    SELECT count(*)::int AS n FROM users WHERE email LIKE '%@example.test' OR email LIKE 'demo-%'`;
  log(`\n  test/demo accounts remaining: ${leftover[0].n}`);

  if (unmatched.length) process.exitCode = 1;
} finally {
  await sql.end();
}
